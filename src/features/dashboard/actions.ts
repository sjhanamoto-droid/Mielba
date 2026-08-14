"use server";

// ダッシュボードの手動アクション。
// 「日報未提出者へのリマインド」を管理者が任意のタイミングで送る。
// 送信先は「当日に現場入り(SiteVisit)があるのに、当日の日報が SUBMITTED で無い」本人のみ。
// Cron(report-missing) と同じ突き合わせだが、手動は任意タイミングで再送できるよう dedupe しない。

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { createNotification } from "@/lib/notifications";
import { dayRangeForKey, jstDateKey } from "@/lib/date";

export type RemindState = { error?: string; ok?: boolean; count?: number };

export async function remindMissingReports(): Promise<RemindState> {
  await requireAdmin();

  const dayKey = jstDateKey();
  const range = dayRangeForKey(dayKey);

  const [visits, reports] = await Promise.all([
    db.siteVisit.findMany({ where: { date: range }, select: { siteId: true, userId: true } }),
    db.dailyReport.findMany({
      where: { workDate: range, status: "SUBMITTED" },
      select: { siteId: true, userId: true },
    }),
  ]);

  const submitted = new Set(reports.map((r) => `${r.siteId}:${r.userId}`));

  // 未提出の「本人」を重複除去（同一人物が複数現場でも通知は1件）
  const pendingUserIds = new Set<string>();
  for (const v of visits) {
    if (!submitted.has(`${v.siteId}:${v.userId}`)) pendingUserIds.add(v.userId);
  }

  if (pendingUserIds.size === 0) {
    return { ok: true, count: 0 };
  }

  let count = 0;
  for (const userId of pendingUserIds) {
    try {
      // dedupeKey なし＝任意タイミングで都度送信（アプリ内通知＋Web Push）
      const done = await createNotification({
        userId,
        type: "REPORT_MISSING",
        title: "日報の提出をお願いします",
        body: "本日分の日報がまだ提出されていません。ご確認ください。",
        href: "/reports",
      });
      if (done) count++;
    } catch (e) {
      console.error("[remindMissingReports] 通知作成に失敗:", e);
    }
  }

  return { ok: true, count };
}
