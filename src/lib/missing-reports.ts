import { db } from "@/lib/db";
import { jstDateKey, dateFromKey, addDaysKey, storedDateKey } from "@/lib/date";
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
  /** 現調中の現場（日報ではなく現調フォーマットを書く） */
  siteInSurvey: boolean;
};

/** 現調中の現場か（日報の代わりに現調フォーマットを書く） */
export function isSurveySite(siteStatus: string): boolean {
  return siteStatus === "SURVEY";
}

/** 現調の現場で「日報を書く」に相当する画面 */
export function surveyFormHref(siteId: string): string {
  return `/sites/${siteId}/survey`;
}

/**
 * 現調フォーマットがその現場入りの日以降に保存されていれば、その日の記録は済んでいるとみなす。
 * 現調の現場では日報ではなく現調フォーマットを書くため（フォーマットは現場に1つなので、
 * 「行った日以降に保存したか」で日ごとの入力を判定する）。
 * 受注済に変わったあとも、現調期間の現場入りが未入力扱いに戻らないよう、現場の状態は見ない。
 */
export function surveyCoversVisit(
  surveyUpdatedAt: Date | null | undefined,
  visitDate: Date,
): boolean {
  if (!surveyUpdatedAt) return false;
  const dayStart = dateFromKey(storedDateKey(visitDate));
  return surveyUpdatedAt.getTime() >= dayStart.getTime();
}

/**
 * 指定ユーザーの「前日以前・直近 MISSING_LOOKBACK_DAYS 日」の範囲で、
 * 現場入り(SiteVisit)があるのに提出済み日報(SUBMITTED)が無い (現場, 日) を返す。
 * 現調フォーマットがその日以降に保存されている現場入りは済みとみなす。
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
      select: {
        siteId: true,
        date: true,
        site: {
          select: {
            name: true,
            siteStatus: true,
            survey: { select: { updatedAt: true } },
          },
        },
      },
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
    const k = `${r.siteId}:${storedDateKey(r.workDate)}`;
    if (r.status === "SUBMITTED") submitted.add(k);
    else if (!draftByKey.has(k)) draftByKey.set(k, r.id);
  }

  const missing: MissingReport[] = [];
  for (const v of visits) {
    const dateKey = storedDateKey(v.date);
    const k = `${v.siteId}:${dateKey}`;
    if (submitted.has(k)) continue;
    if (surveyCoversVisit(v.site.survey?.updatedAt, v.date)) continue;
    missing.push({
      siteId: v.siteId,
      siteName: v.site.name,
      dateKey,
      dateLabel: fmtDateWithDay(v.date),
      draftReportId: draftByKey.get(k) ?? null,
      siteInSurvey: isSurveySite(v.site.siteStatus),
    });
  }
  return missing;
}
