import { db } from "@/lib/db";
import { jstMonthKey, storedDateKey, monthRangeForKey } from "@/lib/date";
import { workMinutes } from "@/lib/utils";

// 人ごとの稼働時間の日別内訳（/attendance/[userId] とスタッフページで共用）。

// ?ym=YYYY-MM を解釈。不正なら当月（日本時間の暦月）。
export function parseMonthKey(s: string | undefined): string {
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) return s;
  }
  return jstMonthKey();
}

export type DayRow = {
  key: string;
  reportId: string | null; // 日報 → id / 事務所作業 → null（リンクなし）
  siteName: string;
  start: string;
  end: string;
  minutes: number;
  office: boolean;
};

export type WorkDay = [key: string, day: { minutes: number; rows: DayRow[] }];

/** その人の月の稼働（提出済み日報＋事務所作業）を日ごとにまとめる */
export async function getUserWorkDays(userId: string, ym: string) {
  const range = monthRangeForKey(ym);
  const [reports, officeEvents] = await Promise.all([
    // 下書き(DRAFT)は勤怠に計上しない（提出して初めて稼働になる）
    db.dailyReport.findMany({
      where: { userId, workDate: range, status: "SUBMITTED", absent: false }, // 現場不参加は稼働に入れない
      select: {
        id: true,
        workDate: true,
        startTime: true,
        endTime: true,
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
    }),
    // 事務所作業（本人所有の個人予定・日報なし）。稼働時間に計上する。
    db.calendarEvent.findMany({
      // 非公開の個人予定（最高管理者の「表示しない」）は業務外扱いで計上しない（一覧側と揃える）
      where: { ownerId: userId, category: "OFFICE", date: range, isPrivate: false },
      select: { id: true, date: true, startTime: true, endTime: true, allDay: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);

  // 日（JST暦日）ごとに、現場ごとの稼働をまとめる。
  const dayMap = new Map<string, { minutes: number; rows: DayRow[] }>();
  for (const r of reports) {
    const key = storedDateKey(r.workDate);
    const minutes = workMinutes(r.startTime, r.endTime);
    const entry = dayMap.get(key) ?? { minutes: 0, rows: [] };
    entry.minutes += minutes;
    entry.rows.push({
      key: r.id,
      reportId: r.id,
      siteName: r.site?.name ?? "（現場なし）",
      start: r.startTime,
      end: r.endTime,
      minutes,
      office: false,
    });
    dayMap.set(key, entry);
  }
  // 事務所作業（日報なし）を日別内訳に加える。終日は 8:00-17:00 で計上。
  for (const e of officeEvents) {
    const key = storedDateKey(e.date);
    const start = e.allDay ? "08:00" : e.startTime ?? "";
    const end = e.allDay ? "17:00" : e.endTime ?? "";
    const minutes = e.allDay ? workMinutes("08:00", "17:00") : workMinutes(e.startTime, e.endTime);
    const entry = dayMap.get(key) ?? { minutes: 0, rows: [] };
    entry.minutes += minutes;
    entry.rows.push({
      key: e.id,
      reportId: null,
      siteName: "事務所作業",
      start,
      end,
      minutes,
      office: true,
    });
    dayMap.set(key, entry);
  }
  const days: WorkDay[] = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const totalMinutes = [...dayMap.values()].reduce((s, d) => s + d.minutes, 0);

  return { days, totalMinutes };
}
