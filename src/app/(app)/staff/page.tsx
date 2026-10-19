import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { requireSuperAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { addMonthsKey, dateFromKey, jstDateKey, jstMonthKey, monthRangeForKey } from "@/lib/date";
import { rateOn } from "@/lib/pay-rates";
import { laborCostForMonth } from "@/lib/labor-cost";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MonthNav } from "@/features/attendance/work-day-list";
import { parseMonthKey } from "@/features/attendance/work-days";
import { DayStatusBadge } from "@/features/staff/day-status-badge";
import { activeAssignedSiteCounts, dayStatusByUser, payLabel, ratesByUser } from "@/features/staff/data";
import { ROLE_LABEL, employmentLabelForRole, type Role } from "@/lib/constants";
import { fmtWorkMinutes, fmtYen } from "@/lib/utils";

// スタッフ一覧（最高管理者専用）：今日の状況・月の稼働・担当現場・給与・人件費を1人1行で。
// アカウントの管理（メール・パスワード・権限）は 設定 › スタッフ管理。
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  await requireSuperAdmin();
  const ym = parseMonthKey((await searchParams).ym);
  const [y, m] = ym.split("-").map(Number);
  const monthLabel = `${y}年${m}月`;
  const isCurrent = ym === jstMonthKey();
  const todayKey = jstDateKey();
  // 給与は月末（今月なら今日）時点のもの
  const lastDay = new Date(monthRangeForKey(ym).lt.getTime() - 1);
  const rateDate = isCurrent ? dateFromKey(todayKey) : lastDay;

  const [users, { byUser }, statuses, siteCounts, rates] = await Promise.all([
    db.user.findMany({
      select: { id: true, name: true, role: true, active: true, avatarColor: true, avatarImage: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    laborCostForMonth(ym),
    dayStatusByUser(todayKey),
    activeAssignedSiteCounts(),
    ratesByUser(),
  ]);

  const totals = { days: 0, minutes: 0, cost: 0 };
  for (const u of byUser.values()) {
    totals.days += u.workDays;
    totals.minutes += u.minutes;
    totals.cost += u.total;
  }

  return (
    <div>
      <PageHeader title="スタッフ" subtitle="状況・稼働・給与・人件費" backHref="/" />
      <PageContainer>
        <div className="space-y-4">
          <MonthNav
            monthLabel={monthLabel}
            isCurrent={isCurrent}
            prevHref={`/staff?ym=${addMonthsKey(ym, -1)}`}
            nextHref={`/staff?ym=${addMonthsKey(ym, 1)}`}
          />

          <Card className="grid grid-cols-3 divide-x divide-line">
            <Stat label="延べ稼働" value={`${totals.days}日`} />
            <Stat label="稼働時間" value={fmtWorkMinutes(totals.minutes)} />
            <Stat label="人件費" value={fmtYen(Math.round(totals.cost))} />
          </Card>

          <Card className="divide-y divide-line overflow-hidden">
            {users.map((u) => {
              const month = byUser.get(u.id);
              const rate = rateOn(rates.get(u.id) ?? [], rateDate);
              const pay = payLabel(rate);
              const status = statuses.get(u.id) ?? { kind: "NONE" as const, label: "予定なし" };
              const perDay =
                month && month.workDays > 0 && month.total > 0 ? month.total / month.workDays : null;
              return (
                <Link
                  key={u.id}
                  href={`/staff/${u.id}?ym=${ym}`}
                  className={`flex items-start gap-3 px-4 py-3.5 tap-row ${!u.active ? "opacity-60" : ""}`}
                >
                  <Avatar name={u.name} color={u.avatarColor} image={u.avatarImage} size="lg" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-base font-bold text-ink">{u.name}</span>
                      <Badge tone="neutral">{ROLE_LABEL[u.role as Role] ?? u.role}</Badge>
                      <span className="text-xs text-ink-muted">{employmentLabelForRole(u.role)}</span>
                      {!u.active && <Badge tone="danger">無効</Badge>}
                    </div>
                    {u.active && isCurrent && <DayStatusBadge status={status} />}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-muted tnum">
                      <span>
                        稼働 <b className="text-ink">{month?.workDays ?? 0}日</b>・{fmtWorkMinutes(month?.minutes ?? 0)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />担当 {siteCounts.get(u.id) ?? 0}件
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm tnum">
                      {pay ? (
                        <span className="text-ink-muted">{pay}</span>
                      ) : (
                        <span className="font-semibold text-status-danger">給与未登録</span>
                      )}
                      {perDay != null && (
                        <span className="text-ink-muted">
                          1人工 <b className="text-ink">{fmtYen(Math.round(perDay))}</b>
                        </span>
                      )}
                      {month && month.total > 0 && (
                        <span className="text-ink-muted">
                          人件費 <b className="text-ink">{fmtYen(Math.round(month.total))}</b>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-ink-faint" />
                </Link>
              );
            })}
          </Card>

          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            稼働は提出済みの日報＋事務所作業（同じ日は1日）。1人工は「その月の人件費 ÷ 稼働日数」。月給は月の人件費 ÷ 稼働日数、日当はそのまま、時給は作業時間で計算します。給与は
            {isCurrent ? "今日" : "月末"}時点のものです。メール・パスワード・権限の変更は 設定 › スタッフ管理 から。
          </p>
        </div>
      </PageContainer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 text-base font-bold text-ink tnum">{value}</p>
    </div>
  );
}
