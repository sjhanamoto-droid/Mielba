import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, CalendarDays } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstMonthKey, monthRangeForKey, addMonthsKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { workMinutes, fmtWorkMinutes } from "@/lib/utils";

// ?ym=YYYY-MM を解釈。不正なら当月（日本時間の暦月）。
function parseMonthKey(s: string | undefined): string {
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) return s;
  }
  return jstMonthKey();
}

type Row = {
  userId: string;
  name: string;
  avatarColor: string;
  minutes: number;
  days: number;
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const ym = parseMonthKey(sp.ym);
  const range = monthRangeForKey(ym);
  const [y, m] = ym.split("-").map(Number);
  const monthLabel = `${y}年${m}月`;
  const isCurrent = ym === jstMonthKey();

  // 対象月の提出済み日報＋「事務所作業」の予定を取得し、ユーザー×月で稼働時間（Σ end-start）と日数を集計する。
  // 下書き(DRAFT)は勤怠に計上しない（未提出扱いと矛盾するため。提出して初めて稼働になる）。
  // 事務所作業（個人予定・日報なし）も稼働時間に計上する（予定の開始〜終了、終日は 8:00-17:00）。
  const [reports, officeEvents] = await Promise.all([
    db.dailyReport.findMany({
      where: { workDate: range, status: "SUBMITTED" },
      select: {
        userId: true,
        startTime: true,
        endTime: true,
        user: { select: { name: true, avatarColor: true } },
      },
    }),
    db.calendarEvent.findMany({
      where: { category: "OFFICE", date: range, ownerId: { not: null } },
      select: {
        ownerId: true,
        startTime: true,
        endTime: true,
        allDay: true,
        owner: { select: { name: true, avatarColor: true } },
      },
    }),
  ]);

  const byUser = new Map<string, Row>();
  for (const r of reports) {
    let row = byUser.get(r.userId);
    if (!row) {
      row = {
        userId: r.userId,
        name: r.user.name,
        avatarColor: r.user.avatarColor,
        minutes: 0,
        days: 0,
      };
      byUser.set(r.userId, row);
    }
    row.minutes += workMinutes(r.startTime, r.endTime);
    row.days += 1;
  }
  // 事務所作業（日報なし）の稼働を加算。所有者（本人）に計上する。
  for (const e of officeEvents) {
    const uid = e.ownerId!;
    let row = byUser.get(uid);
    if (!row) {
      row = {
        userId: uid,
        name: e.owner?.name ?? "—",
        avatarColor: e.owner?.avatarColor ?? "#64748b",
        minutes: 0,
        days: 0,
      };
      byUser.set(uid, row);
    }
    row.minutes += e.allDay ? workMinutes("08:00", "17:00") : workMinutes(e.startTime, e.endTime);
    row.days += 1;
  }

  const rows = [...byUser.values()].sort(
    (a, b) => b.minutes - a.minutes || b.days - a.days,
  );
  const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
  const totalDays = rows.reduce((s, r) => s + r.days, 0);

  return (
    <div>
      <PageHeader title="稼働時間" subtitle="月別・人別の稼働集計" backHref="/" />
      <PageContainer>
        <div className="space-y-4">
          {/* 月ナビ */}
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/attendance?ym=${addMonthsKey(ym, -1)}`}
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
              href={`/attendance?ym=${addMonthsKey(ym, 1)}`}
              aria-label="翌月"
              className={buttonClass({ variant: "outline", size: "icon" })}
            >
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>

          {/* 月合計 */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Clock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-ink tnum">{fmtWorkMinutes(totalMinutes)}</p>
                <p className="text-xs text-ink-muted">総稼働時間</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-ink tnum">{totalDays} 日</p>
                <p className="text-xs text-ink-muted">延べ稼働日数</p>
              </div>
            </Card>
          </div>

          {/* 人別一覧 */}
          <section className="space-y-2.5">
            <SectionTitle>スタッフ別</SectionTitle>
            {rows.length === 0 ? (
              <EmptyState
                icon={<Clock className="h-6 w-6" />}
                title="この月の稼働はまだありません"
                description="日報の提出、または「事務所作業」の予定を入れると、ここに稼働時間が集計されます。"
              />
            ) : (
              <Card className="divide-y divide-line">
                {rows.map((r) => (
                  <Link
                    key={r.userId}
                    href={`/attendance/${r.userId}?ym=${ym}`}
                    className="flex items-center gap-3 px-4 py-3 tap-row"
                  >
                    <Avatar name={r.name} color={r.avatarColor} size="md" />
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{r.name}</p>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-ink tnum">{fmtWorkMinutes(r.minutes)}</p>
                      <p className="text-[11px] text-ink-muted tnum">{r.days} 日</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            稼働時間は提出済みの日報の作業開始〜終了（Σ 終了−開始）に、「事務所作業」の予定（終日は 8:00〜17:00）を
            加えて算出します。下書きの日報は計上されません。日跨ぎは想定せず、時刻が未設定・異常な場合は 0 として扱います。
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
