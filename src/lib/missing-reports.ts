import { db } from "@/lib/db";
import { jstDateKey, dateFromKey, addDaysKey } from "@/lib/date";
import { fmtDateWithDay } from "@/lib/utils";

// 前日以前の「日報未入力」を強制ゲートで遡ってチェックする日数。
// 稼働開始前の古い抜けで全員が一斉にブロックされる事故を避けるため、直近2週間に限定する。
export const MISSING_LOOKBACK_DAYS = 14;

export type MissingReport = {
  siteId: string;
  siteName: string;
  dateKey: string; // "YYYY-MM-DD"（作業日）
  dateLabel: string; // 表示用（例: 8月4日(月)）
  draftReportId: string | null; // 下書きがあれば編集リンク、なければ新規作成
};

// stored Date（サーバーTZ深夜0時。dateFromKey の対）→ "YYYY-MM-DD"。
// jstDateKey ではなくローカル日付要素で復元する（dateFromKey と同じ慣習に揃える）。
function storedKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * 指定ユーザーの「前日以前・直近 MISSING_LOOKBACK_DAYS 日」の範囲で、
 * 現場入り(SiteVisit)があるのに提出済み日報(SUBMITTED)が無い (現場, 日) を返す。
 * 下書き(DRAFT)がある場合は draftReportId を添えて編集導線に使う。新しい日付順。
 */
export async function getMissingPastReports(userId: string): Promise<MissingReport[]> {
  const todayKey = jstDateKey();
  const todayStart = dateFromKey(todayKey); // これ未満＝前日以前
  const lookbackStart = dateFromKey(addDaysKey(todayKey, -MISSING_LOOKBACK_DAYS));

  // 過去14日間の自分の現場入りと、同期間の自分の日報を突き合わせる。
  const [visits, reports] = await Promise.all([
    db.siteVisit.findMany({
      where: { userId, date: { gte: lookbackStart, lt: todayStart } },
      select: { siteId: true, date: true, site: { select: { name: true } } },
      orderBy: { date: "desc" },
    }),
    db.dailyReport.findMany({
      where: { userId, workDate: { gte: lookbackStart, lt: todayStart } },
      select: { id: true, siteId: true, workDate: true, status: true },
    }),
  ]);
  if (visits.length === 0) return [];

  const submitted = new Set<string>();
  const draftByKey = new Map<string, string>();
  for (const r of reports) {
    const k = `${r.siteId}:${storedKey(r.workDate)}`;
    if (r.status === "SUBMITTED") submitted.add(k);
    else if (!draftByKey.has(k)) draftByKey.set(k, r.id);
  }

  const missing: MissingReport[] = [];
  for (const v of visits) {
    const dateKey = storedKey(v.date);
    const k = `${v.siteId}:${dateKey}`;
    if (submitted.has(k)) continue;
    missing.push({
      siteId: v.siteId,
      siteName: v.site.name,
      dateKey,
      dateLabel: fmtDateWithDay(v.date),
      draftReportId: draftByKey.get(k) ?? null,
    });
  }
  return missing;
}
