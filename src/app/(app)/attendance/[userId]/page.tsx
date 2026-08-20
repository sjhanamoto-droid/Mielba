import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, HardHat, Briefcase } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstMonthKey, storedDateKey, dateFromKey, monthRangeForKey, addMonthsKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { workMinutes, fmtWorkMinutes, fmtDateWithDay } from "@/lib/utils";

// ?ym=YYYY-MM を解釈。不正なら当月（日本時間の暦月）。
function parseMonthKey(s: string | undefined): string {
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) return s;
  }
  return jstMonthKey();
}

type DayRow = {
  key: string;
  reportId: string | null; // 日報 → id / 事務所作業 → null（リンクなし）
  siteName: string;
  start: string;
  end: string;
  minutes: number;
  office: boolean;
};

// 月別・人別 稼働時間の「日別内訳」。どの現場で何時間働いたかを1日ずつ表示する。
export default async function AttendanceUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const ym = parseMonthKey((await searchParams).ym);
  const range = monthRangeForKey(ym);
  const [y, m] = ym.split("-").map(Number);
  const monthLabel = `${y}年${m}月`;
  const isCurrent = ym === jstMonthKey();

  const [target, reports, officeEvents] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, avatarColor: true } }),
    // 下書き(DRAFT)は勤怠に計上しない（提出して初めて稼働になる）
    db.dailyReport.findMany({
      where: { userId, workDate: range, status: "SUBMITTED" },
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
      where: { ownerId: userId, category: "OFFICE", date: range },
      select: { id: true, date: true, startTime: true, endTime: true, allDay: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);
  if (!target) notFound();

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
  const days = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const totalMinutes = [...dayMap.values()].reduce((s, d) => s + d.minutes, 0);

  const monthHref = (targetYm: string) => `/attendance/${userId}?ym=${targetYm}`;

  return (
    <div>
      <PageHeader title="稼働の内訳" subtitle={target.name} backHref={`/attendance?ym=${ym}`} />
      <PageContainer>
        <div className="space-y-4">
          {/* 月ナビ */}
          <div className="flex items-center justify-between gap-2">
            <Link
              href={monthHref(addMonthsKey(ym, -1))}
              aria-label="前月"
              className={buttonClass({ variant: "outline", size: "icon" })}
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="text-center leading-tight">
              <p className="text-base font-bold text-ink tnum md:text-lg">{monthLabel}</p>
              {isCurrent && <p className="text-[11px] font-semibold text-brand-600">今月</p>}
            </div>
            <Link
              href={monthHref(addMonthsKey(ym, 1))}
              aria-label="翌月"
              className={buttonClass({ variant: "outline", size: "icon" })}
            >
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>

          {/* 本人サマリー */}
          <Card className="flex items-center gap-3 p-4">
            <Avatar name={target.name} color={target.avatarColor} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{target.name}</p>
              <p className="text-xs text-ink-muted">{monthLabel} の稼働</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-ink tnum">{fmtWorkMinutes(totalMinutes)}</p>
              <p className="text-[11px] text-ink-muted tnum">{days.length} 日</p>
            </div>
          </Card>

          {/* 日別内訳 */}
          {days.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-6 w-6" />}
              title="この月の稼働はまだありません"
              description="日報の提出、または「事務所作業」の予定を入れると、日ごとの稼働がここに表示されます。"
            />
          ) : (
            <div className="space-y-3">
              {days.map(([key, d]) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-bold text-ink">{fmtDateWithDay(dateFromKey(key))}</p>
                    <p className="text-sm font-bold text-brand-600 tnum">{fmtWorkMinutes(d.minutes)}</p>
                  </div>
                  <Card className="divide-y divide-line">
                    {d.rows.map((row) =>
                      row.office ? (
                        <div key={row.key} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                            <Briefcase className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-ink">{row.siteName}</p>
                            <p className="text-[11px] text-ink-muted tnum">
                              {row.start}〜{row.end}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold text-ink tnum">
                            {fmtWorkMinutes(row.minutes)}
                          </p>
                        </div>
                      ) : (
                        <Link
                          key={row.key}
                          href={`/reports/${row.reportId}`}
                          className="flex items-center gap-3 px-4 py-3 tap-row"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                            <HardHat className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-ink">{row.siteName}</p>
                            <p className="text-[11px] text-ink-muted tnum">
                              {row.start}〜{row.end}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold text-ink tnum">
                            {fmtWorkMinutes(row.minutes)}
                          </p>
                          <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                        </Link>
                      ),
                    )}
                  </Card>
                </div>
              ))}
            </div>
          )}

          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            各行は提出済みの日報の作業時間（終了−開始）です。下書きの日報は計上されません。「事務所作業」の予定も稼働に含みます（終日は 8:00〜17:00）。日跨ぎは想定せず、時刻が未設定・異常な場合は 0 として扱います。
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
