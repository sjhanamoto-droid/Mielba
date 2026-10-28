import { db } from "@/lib/db";
import { addDaysKey, dateFromKey, storedDateKey } from "@/lib/date";
import { USER_EDITABLE_EVENT_SOURCES } from "@/lib/constants";

// 同じ現場の作業予定の「重複かも」判定（手動の予定と、日報の次回作業日から入った予定が二重になるのを防ぐ）。
// 日付が少しずれて入ることもある（手動で11/10、日報で11/9 など）ので、前後数日を同じ工事の候補として扱う。

/** 前後何日までを「重複かも」とみなすか */
export const NEARBY_EVENT_DAYS = 3;

/** 重複判定の対象にする予定か（作業の予定だけ。打合せ・検査・休みなどは別物として扱う） */
export function isDuplicateCandidateCategory(category: string | null | undefined): boolean {
  return !category || category === "WORK";
}

export type NearbyEvent = {
  id: string;
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  source: string;
  /** 日報の次回作業日から入った（または日報に結び付いた）予定か */
  fromReport: boolean;
  /** 日報由来なら、その日報を書いた人 */
  reportAuthor: string | null;
  participants: string[];
  note: string | null;
};

/**
 * 同じ現場で、date の前後 NEARBY_EVENT_DAYS 日以内にある作業予定を返す（近い日付順）。
 * excludeEventId: 編集中の予定そのもの。excludeReportId: この日報に結び付いた予定（日報の保存し直し）。
 * minDateKey: これより前の予定は見ない（日報なら作業日当日＝今書いている作業の予定を候補にしない）。
 */
export async function findNearbySiteWorkEvents(
  siteId: string,
  dateKey: string,
  opts: { excludeEventId?: string | null; excludeReportId?: string | null; minDateKey?: string | null } = {},
): Promise<NearbyEvent[]> {
  const fromKey = addDaysKey(dateKey, -NEARBY_EVENT_DAYS);
  const gte = dateFromKey(opts.minDateKey && opts.minDateKey > fromKey ? opts.minDateKey : fromKey);
  const lt = dateFromKey(addDaysKey(dateKey, NEARBY_EVENT_DAYS + 1));
  const events = await db.calendarEvent.findMany({
    where: {
      siteId,
      date: { gte, lt },
      isPrivate: false,
      // 配達などの日報由来の予定は対象外（まとめられるのは手動の予定と次回工程だけ）
      source: { in: [...USER_EDITABLE_EVENT_SOURCES] },
      ...(opts.excludeEventId ? { id: { not: opts.excludeEventId } } : {}),
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      allDay: true,
      source: true,
      category: true,
      reportId: true,
      note: true,
      participants: { select: { user: { select: { name: true } } } },
    },
    orderBy: { date: "asc" },
  });
  const candidates = events.filter(
    (e) =>
      isDuplicateCandidateCategory(e.category) &&
      !(opts.excludeReportId && e.reportId === opts.excludeReportId),
  );
  const reportIds = [...new Set(candidates.map((e) => e.reportId).filter((x): x is string => !!x))];
  const reports = reportIds.length
    ? await db.dailyReport.findMany({
        where: { id: { in: reportIds } },
        select: { id: true, user: { select: { name: true } } },
      })
    : [];
  const authorOf = new Map(reports.map((r) => [r.id, r.user.name]));
  const target = dateFromKey(dateKey).getTime();
  return candidates
    .map((e) => ({
      id: e.id,
      dateKey: storedDateKey(e.date),
      startTime: e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
      source: e.source,
      fromReport: !!e.reportId,
      reportAuthor: e.reportId ? authorOf.get(e.reportId) ?? null : null,
      participants: e.participants.map((p) => p.user.name),
      note: e.note,
    }))
    .sort(
      (a, b) =>
        Math.abs(dateFromKey(a.dateKey).getTime() - target) -
        Math.abs(dateFromKey(b.dateKey).getTime() - target),
    );
}
