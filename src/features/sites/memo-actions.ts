"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { parseAndValidatePhotosField, type NewPhotoInput } from "@/lib/photos";
import { deleteUnreferencedBlobs } from "@/lib/blob-cleanup";
import { MEMO_MEDIA_MAX_COUNT } from "@/lib/media-limits";

// 現場メモ（SiteMemo）のサーバーアクション。
// 日報以外の「現場に関する気づき・連絡・覚え書き」を、現場詳細の先頭からその場で残す。
// 写真・動画も添えられる。実体は日報と同じく Vercel Blob にブラウザから直接上げてあり、
// ここには blobPath と一覧用サムネイルだけが届く（関数の 4.5MB 上限を通さない）。
// 追加は全ログインユーザー可。編集・削除は投稿者本人か管理者のみ。

const MAX_LEN = 2000;
const EMPTY_MSG = "メモの内容を入力するか、写真・動画を添付してください。";

function normalizeContent(raw: unknown, hasMedia: boolean): { content: string } | { error: string } {
  const content = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  // 写真・動画だけのメモも許す（「これ見て」と現場の様子を共有する用途）
  if (!content && !hasMedia) return { error: EMPTY_MSG };
  if (content.length > MAX_LEN) return { error: `メモは${MAX_LEN}文字以内で入力してください。` };
  return { content };
}

/** 添付JSON（アップローダーの serialize 形式）を検証する */
function parsePhotos(raw: unknown) {
  const parsed = parseAndValidatePhotosField(typeof raw === "string" ? raw : "");
  if ("error" in parsed) return parsed;
  if (parsed.kept.length + parsed.added.length > MEMO_MEDIA_MAX_COUNT) {
    return { error: `1件のメモに添えられる写真・動画は${MEMO_MEDIA_MAX_COUNT}件までです。` };
  }
  // メモの添付は Blob 経路（写真・動画）だけ。base64 経路（PDF 等）は受けない
  if (parsed.added.some((p) => !p.blobPath)) {
    return { error: "メモに添付できるのは写真と動画だけです。" };
  }
  return parsed;
}

/** 新規添付を Photo 行にする（kind は「メモ」で固定） */
function toPhotoRows(added: NewPhotoInput[]) {
  return added.map((p) => ({
    kind: "MEMO",
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
}

/** 現場メモを追加する（photosJson はアップローダーの出力。省略可） */
export async function addSiteMemo(siteId: string, raw: string, photosJson = "") {
  const user = await requireUser();
  const photos = parsePhotos(photosJson);
  if ("error" in photos) return { error: photos.error };
  // 新規メモに「既存の添付（{id}）」は付けられない
  if (photos.kept.length > 0) return { error: "添付データの形式が不正です。選び直して再度お試しください。" };
  const normalized = normalizeContent(raw, photos.added.length > 0);
  if ("error" in normalized) return { error: normalized.error };

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, siteStatus: true },
  });
  if (!site) return { error: "現場が見つかりません。" };

  await db.siteMemo.create({
    data: {
      siteId,
      content: normalized.content,
      createdById: user.id,
      // 現調中の現場に残したメモは「現調」と分かるようにしておく（後から見返すときの手がかり）
      atSurvey: site.siteStatus === "SURVEY",
      photos: photos.added.length > 0 ? { create: toPhotoRows(photos.added) } : undefined,
    },
  });

  revalidatePath(`/sites/${siteId}`);
  return { ok: true };
}

/**
 * 現場メモを編集する（投稿者本人か管理者のみ）。
 * photosJson は必須。{id} に無い既存添付は外し、新規分を追加する
 * （空文字＝添付をすべて外す、なので省略可にはしない）。
 */
export async function updateSiteMemo(memoId: string, raw: string, photosJson: string) {
  const user = await requireUser();
  const photos = parsePhotos(photosJson);
  if ("error" in photos) return { error: photos.error };

  const memo = await db.siteMemo.findUnique({
    where: { id: memoId },
    select: {
      id: true,
      siteId: true,
      createdById: true,
      photos: { select: { id: true, blobPath: true } },
    },
  });
  if (!memo) return { error: "メモが見つかりません。" };
  if (memo.createdById !== user.id && !isAdmin(user)) {
    return { error: "このメモを編集できるのは投稿者本人か管理者のみです。" };
  }

  const kept = new Set(photos.kept);
  const remaining = memo.photos.filter((p) => kept.has(p.id));
  const removed = memo.photos.filter((p) => !kept.has(p.id));
  const normalized = normalizeContent(raw, remaining.length + photos.added.length > 0);
  if ("error" in normalized) return { error: normalized.error };

  await db.$transaction(async (tx) => {
    if (removed.length > 0) {
      await tx.photo.deleteMany({ where: { memoId, id: { in: removed.map((p) => p.id) } } });
    }
    await tx.siteMemo.update({
      where: { id: memoId },
      data: {
        content: normalized.content,
        photos: photos.added.length > 0 ? { create: toPhotoRows(photos.added) } : undefined,
      },
    });
  });
  await deleteUnreferencedBlobs(removed.map((p) => p.blobPath));

  revalidatePath(`/sites/${memo.siteId}`);
  return { ok: true };
}

/** 現場メモを削除する（投稿者本人か管理者のみ）。添付の写真・動画も一緒に消える */
export async function deleteSiteMemo(memoId: string) {
  const user = await requireUser();

  const memo = await db.siteMemo.findUnique({
    where: { id: memoId },
    select: {
      id: true,
      siteId: true,
      createdById: true,
      photos: { select: { blobPath: true } },
    },
  });
  if (!memo) return { ok: true }; // すでに削除済み（多重クリック等）
  if (memo.createdById !== user.id && !isAdmin(user)) {
    return { error: "このメモを削除できるのは投稿者本人か管理者のみです。" };
  }

  await db.siteMemo.delete({ where: { id: memoId } }); // 添付の Photo 行は CASCADE で消える
  await deleteUnreferencedBlobs(memo.photos.map((p) => p.blobPath));

  revalidatePath(`/sites/${memo.siteId}`);
  return { ok: true };
}
