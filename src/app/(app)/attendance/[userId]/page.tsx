import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstMonthKey, addMonthsKey } from "@/lib/date";
import { getUserWorkDays, parseMonthKey } from "@/features/attendance/work-days";
import { MonthNav, WorkDayList } from "@/features/attendance/work-day-list";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { fmtWorkMinutes } from "@/lib/utils";

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
  const [y, m] = ym.split("-").map(Number);
  const monthLabel = `${y}年${m}月`;
  const isCurrent = ym === jstMonthKey();

  const [target, { days, totalMinutes }] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, avatarColor: true, avatarImage: true } }),
    getUserWorkDays(userId, ym),
  ]);
  if (!target) notFound();

  const monthHref = (targetYm: string) => `/attendance/${userId}?ym=${targetYm}`;

  return (
    <div>
      <PageHeader title="稼働の内訳" subtitle={target.name} backHref={`/attendance?ym=${ym}`} />
      <PageContainer>
        <div className="space-y-4">
          <MonthNav
            monthLabel={monthLabel}
            isCurrent={isCurrent}
            prevHref={monthHref(addMonthsKey(ym, -1))}
            nextHref={monthHref(addMonthsKey(ym, 1))}
          />

          {/* 本人サマリー */}
          <Card className="flex items-center gap-3 p-4">
            <Avatar name={target.name} color={target.avatarColor} image={target.avatarImage} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-ink">{target.name}</p>
              <p className="text-sm text-ink-muted">{monthLabel} の稼働</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold text-ink tnum">{fmtWorkMinutes(totalMinutes)}</p>
              <p className="text-sm text-ink-muted tnum">{days.length} 日</p>
            </div>
          </Card>

          <WorkDayList days={days} />
        </div>
      </PageContainer>
    </div>
  );
}
