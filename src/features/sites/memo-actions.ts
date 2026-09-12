"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";

// 現場メモ（SiteMemo）のサーバーアクション。
// 日報以外の「現場に関する気づき・連絡・覚え書き」を、現場詳細の先頭からその場で残す。
// 追加は全ログインユーザー可。編集・削除は投稿者本人か管理者のみ。

const MAX_LEN = 2000;

function normalize(raw: unknown): { content?: string; error?: string } {
  const content = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!content) return { error: "メモの内容を入力してください。" };
  if (content.length > MAX_LEN) return { error: `メモは${MAX_LEN}文字以内で入力してください。` };
  return { content };
}

/** 現場メモを追加する */
export async function addSiteMemo(siteId: string, raw: string) {
  const user = await requireUser();
  const { content, error } = normalize(raw);
  if (error || !content) return { error };

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, siteStatus: true },
  });
  if (!site) return { error: "現場が見つかりません。" };

  await db.siteMemo.create({
    // 現調中の現場に残したメモは「現調」と分かるようにしておく（後から見返すときの手がかり）
    data: { siteId, content, createdById: user.id, atSurvey: site.siteStatus === "SURVEY" },
  });

  revalidatePath(`/sites/${siteId}`);
  return { ok: true };
}

/** 現場メモを編集する（投稿者本人か管理者のみ） */
export async function updateSiteMemo(memoId: string, raw: string) {
  const user = await requireUser();
  const { content, error } = normalize(raw);
  if (error || !content) return { error };

  const memo = await db.siteMemo.findUnique({
    where: { id: memoId },
    select: { id: true, siteId: true, createdById: true },
  });
  if (!memo) return { error: "メモが見つかりません。" };
  if (memo.createdById !== user.id && !isAdmin(user)) {
    return { error: "このメモを編集できるのは投稿者本人か管理者のみです。" };
  }

  await db.siteMemo.update({ where: { id: memoId }, data: { content } });

  revalidatePath(`/sites/${memo.siteId}`);
  return { ok: true };
}

/** 現場メモを削除する（投稿者本人か管理者のみ） */
export async function deleteSiteMemo(memoId: string) {
  const user = await requireUser();

  const memo = await db.siteMemo.findUnique({
    where: { id: memoId },
    select: { id: true, siteId: true, createdById: true },
  });
  if (!memo) return { ok: true }; // すでに削除済み（多重クリック等）
  if (memo.createdById !== user.id && !isAdmin(user)) {
    return { error: "このメモを削除できるのは投稿者本人か管理者のみです。" };
  }

  await db.siteMemo.delete({ where: { id: memoId } });

  revalidatePath(`/sites/${memo.siteId}`);
  return { ok: true };
}
