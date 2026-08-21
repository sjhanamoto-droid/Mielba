"use server";

// 受信ボックス（LINEで届いたPDF）の振り分け・削除。
// アイテムは Photo(kind="INBOX", siteId=null)。振り分けで siteId と kind
// （DRAWING=図面 / SCHEDULE=工程表）を付けると、現場詳細の既存表示に載る。

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type InboxActionState = { ok?: boolean; error?: string };

const assignSchema = z.object({
  photoId: z.string().min(1),
  siteId: z.string().min(1, "現場を選択してください"),
  kind: z.enum(["DRAWING", "SCHEDULE"]),
  caption: z.string().optional(),
});

export async function assignInboxFile(input: {
  photoId: string;
  siteId: string;
  kind: string;
  caption?: string;
}): Promise<InboxActionState> {
  await requireUser();

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "入力内容を確認してください" };
  }
  const { photoId, siteId, kind } = parsed.data;

  try {
    const photo = await db.photo.findUnique({
      where: { id: photoId },
      select: { kind: true, fileName: true },
    });
    if (!photo) return { error: "ファイルが見つかりません" };
    if (photo.kind !== "INBOX") return { error: "このファイルは振り分け済みです" };

    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { id: true },
    });
    if (!site) return { error: "現場が見つかりません" };

    const caption = (parsed.data.caption ?? "").trim();
    await db.photo.update({
      where: { id: photoId },
      data: {
        siteId,
        kind,
        caption: caption || photo.fileName || null,
      },
    });
  } catch (e) {
    console.error("[inbox] 振り分けエラー:", e);
    return { error: "振り分けに失敗しました。もう一度お試しください。" };
  }

  revalidatePath("/inbox");
  revalidatePath("/menu");
  revalidatePath(`/sites/${siteId}`);
  return { ok: true };
}

export async function deleteInboxFile(photoId: string): Promise<InboxActionState> {
  await requireUser();
  try {
    const photo = await db.photo.findUnique({
      where: { id: photoId },
      select: { kind: true },
    });
    if (!photo) return { error: "ファイルが見つかりません" };
    // 誤送信の削除用。振り分け済み（現場に付いたもの）はここでは消させない
    if (photo.kind !== "INBOX") return { error: "振り分け済みのファイルは削除できません" };
    await db.photo.delete({ where: { id: photoId } });
  } catch (e) {
    console.error("[inbox] 削除エラー:", e);
    return { error: "削除に失敗しました。もう一度お試しください。" };
  }
  revalidatePath("/inbox");
  revalidatePath("/menu");
  return { ok: true };
}
