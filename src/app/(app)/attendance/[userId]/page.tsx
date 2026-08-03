import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, HardHat } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstMonthKey, jstDateKey, dateFromKey, monthRangeForKey, addMonthsKey } from "@/lib/date";
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
  reportId: string;
  siteId: string | null;
  siteName: string;
  start: string;
  end: string;
  minutes: number;
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

  const [target, reports] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, avatarColor: true } }),
    db.dailyReport.findMany({
      where: { userId, workDate: range },
      select: {
        id: true,
        workDate: true,
        startTime: true,
        endTime: true,
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
    }),
  ]);
  if (!target) notFound();

  // 日（JST暦日）ごとに、現場ごとの稼働をまとめる。
  const dayMap = new Map<string, { minutes: number; rows: DayRow[] }>();
  for (const r of reports) {
    const key = jstDateKey(r.workDate);
    const minutes = workMinutes(r.startTime, r.endTime);
    const entry = dayMap.get(key) ?? { minutes: 0, rows: [] };
    entry.minutes += minutes;
    entry.rows.push({
      reportId: r.id,
      siteId: r.site?.id ?? null,
      siteName: r.site?.name ?? "（現場なし）",
      start: r.startTime,
      end: r.endTime,
      minutes,
    });
    dayMap.set(key, entry);
  }
  const days = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const totalMinutes = reports.reduce((s, r) => s + workMinutes(r.startTime, r.endTime), 0);

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
              title="この月の日報はまだありません"
              description="日報が提出されると、日ごとの稼働がここに表示されます。"
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
                    {d.rows.map((row) => (
                      <Link
                        key={row.reportId}
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
                    ))}
                  </Card>
                </div>
              ))}
            </div>
          )}

          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            各行は日報の作業時間（終了−開始）です。タップすると日報を開けます。日跨ぎは想定せず、時刻が未設定・異常な場合は 0 として扱います。
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
