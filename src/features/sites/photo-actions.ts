"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parseAndValidatePhotosField } from "@/lib/photos";
import { deleteUnreferencedBlobs } from "@/lib/blob-cleanup";

// 現場詳細「写真・動画」セクションからの直接アップロードと削除。
// 置き場所は現場のステータスで自動で決める：
// - 現調（SURVEY）: 現調記録(Survey)に付ける。現調フォーマットで撮った写真と同じ扱いで、
//   そちらの画面からも増やしたり消したりできる
// - それ以外: 現場直付け（Photo.siteId）の kind="WORK"。日報を介さない施工中の写真
// 追加はログイン済みなら誰でも。削除もログイン済みなら誰でもできる（現調フォーマットと同じ扱い。
// 写真には投稿者を持たせていないため本人判定はしない。拡大表示で2段階確認を挟む）。
// 削除できるのは、このセクションで管理する写真（現調記録の写真と現場直付けの施工写真）だけ。
// 日報・現場メモに付いた写真は、それぞれの画面から外す。

const SAVE_FAIL_MSG = "写真の保存に失敗しました。時間をおいて再度お試しください。";

/** セクションから写真・動画を追加する（photosJson はアップローダーの出力。実体は Blob に上げ済み） */
export async function addSitePhotos(siteId: string, photosJson: string) {
  await requireUser();
  const parsed = parseAndValidatePhotosField(photosJson);
  if ("error" in parsed) return { error: parsed.error };
  if (parsed.added.length === 0) return { error: "追加する写真・動画がありません。" };
  if (parsed.added.some((p) => !p.blobPath)) {
    return { error: "ここに追加できるのは写真と動画だけです。" };
  }

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, siteStatus: true },
  });
  if (!site) return { error: "現場が見つかりません。" };
  const toSurvey = site.siteStatus === "SURVEY";

  const rows = parsed.added.map((p) => ({
    dataUrl: p.dataUrl ?? null,
    thumbUrl: p.thumbUrl ?? null,
    blobPath: p.blobPath ?? null,
    mimeType: p.mimeType ?? null,
    sizeBytes: p.sizeBytes ?? null,
    duration: p.duration ?? null,
    caption: p.caption.trim() === "" ? null : p.caption,
    isVideo: p.isVideo,
    width: p.width ?? null,
    height: p.height ?? null,
  }));

  try {
    await db.$transaction(async (tx) => {
      // 保存は済んだのに応答だけ届かず再送された場合に、同じ実体を二重に登録しない
      const paths = rows.map((r) => r.blobPath).filter((p): p is string => !!p);
      const dup = await tx.photo.findMany({
        where: { blobPath: { in: paths } },
        select: { blobPath: true },
      });
      const already = new Set(dup.map((d) => d.blobPath));
      const fresh = rows.filter((r) => !r.blobPath || !already.has(r.blobPath));
      if (fresh.length === 0) return;

      if (toSurvey) {
        // 現調記録がまだ無ければ作る（現調フォーマット側と同じ置き場にするため）。
        // 同時に2人が追加しても siteId の一意制約で失敗しないよう upsert にする
        const survey = await tx.survey.upsert({
          where: { siteId },
          create: { siteId, surveyedAt: new Date() },
          update: {},
          select: { id: true },
        });
        await tx.photo.createMany({
          data: fresh.map((r) => ({ ...r, surveyId: survey.id, kind: "SURVEY" })),
        });
      } else {
        await tx.photo.createMany({
          data: fresh.map((r) => ({ ...r, siteId, kind: "WORK" })),
        });
      }
    });
  } catch {
    return { error: SAVE_FAIL_MSG };
  }

  revalidatePath(`/sites/${siteId}`);
  // 現調記録の写真は現調フォーマット・現場修正画面にも出る
  revalidatePath(`/sites/${siteId}/survey`);
  revalidatePath(`/sites/${siteId}/edit`);
  return { ok: true, target: toSurvey ? "survey" : "work" };
}

/** セクションで管理している写真・動画を1件消す（現調記録の写真か、現場直付けの施工写真） */
export async function deleteSitePhoto(photoId: string) {
  await requireUser();

  const photo = await db.photo.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      blobPath: true,
      siteId: true,
      kind: true,
      surveyId: true,
      survey: { select: { siteId: true } },
    },
  });
  if (!photo) return { ok: true }; // すでに削除済み（多重タップ等）

  const siteId = photo.survey?.siteId ?? photo.siteId;
  const managedHere = !!photo.surveyId || (!!photo.siteId && photo.kind === "WORK");
  if (!managedHere || !siteId) {
    return { error: "この写真は日報や現場メモの側から外してください。" };
  }

  try {
    await db.photo.deleteMany({ where: { id: photoId } });
  } catch {
    return { error: "写真の削除に失敗しました。時間をおいて再度お試しください。" };
  }
  await deleteUnreferencedBlobs([photo.blobPath]);

  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/survey`);
  revalidatePath(`/sites/${siteId}/edit`);
  return { ok: true };
}
