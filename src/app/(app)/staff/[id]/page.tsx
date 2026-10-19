import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Pencil } from "lucide-react";
import { requireSuperAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import {
  addDaysKey,
  addMonthsKey,
  dateFromKey,
  jstDateKey,
  jstMonthKey,
  monthRangeForKey,
  storedDateKey,
} from "@/lib/date";
import { rateOn } from "@/lib/pay-rates";
import { laborCostForMonth, monthlyTotal } from "@/lib/labor-cost";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, SiteStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { MonthNav, WorkDayList } from "@/features/attendance/work-day-list";
import { getUserWorkDays, parseMonthKey } from "@/features/attendance/work-days";
import { DayStatusBadge } from "@/features/staff/day-status-badge";
import { dayStatusByUser, payLabel } from "@/features/staff/data";
import { MonthlyCostTable, YearlyPay } from "@/features/staff/pay-summary";
import { PayRateManager } from "@/features/users/pay-rate-manager";
import {
  EVENT_CATEGORY_LABEL,
  ROLE_LABEL,
  employmentLabelForRole,
  type EventCategory,
  type Role,
  type SiteStatus,
} from "@/lib/constants";
import { fmtDateWithDay, fmtWorkMinutes, fmtYen } from "@/lib/utils";

const TABS = ["overview", "work", "pay", "sites"] as const;

// スタッフの個人ページ（最高管理者専用）：概要／稼働時間／給与・人件費／担当現場
export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ym?: string; tab?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const ym = parseMonthKey(sp.ym);
  const tab = TABS.includes(sp.tab as (typeof TABS)[number]) ? sp.tab : "overview";
  const [y, m] = ym.split("-").map(Number);
  const monthLabel = `${y}年${m}月`;
  const isCurrent = ym === jstMonthKey();
  const todayKey = jstDateKey();
  const today = dateFromKey(todayKey);
  const weekEnd = dateFromKey(addDaysKey(todayKey, 7));
  // 直近12か月（表示中の月まで）
  const months = Array.from({ length: 12 }, (_, i) => addMonthsKey(ym, i - 11));

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, active: true, department: true, avatarColor: true, avatarImage: true },
  });
  if (!user) notFound();

  const [rates, work, monthCosts, statuses, visits, events, sites] = await Promise.all([
    db.staffPayRate.findMany({ where: { userId: id }, orderBy: { effectiveFrom: "desc" } }),
    getUserWorkDays(id, ym),
    Promise.all(months.map((k) => laborCostForMonth(k))),
    dayStatusByUser(todayKey),
    // 今日から1週間の配員
    db.siteVisit.findMany({
      where: { userId: id, date: { gte: today, lt: weekEnd } },
      select: { id: true, date: true, site: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
    // 今日から1週間の本人の予定（所有 or 参加。非公開は業務外として出さない）
    db.calendarEvent.findMany({
      where: {
        date: { gte: today, lt: weekEnd },
        isPrivate: false,
        OR: [{ ownerId: id }, { participants: { some: { userId: id } } }],
      },
      select: { id: true, date: true, title: true, category: true, startTime: true, allDay: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.site.findMany({
      where: { assigneeId: id },
      select: { id: true, name: true, siteStatus: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const month = monthCosts[11].byUser.get(id);
  // 表示中の月に使える給与（今月なら今日、ほかの月は月末時点）
  const rate = rateOn(rates, isCurrent ? today : new Date(monthRangeForKey(ym).lt.getTime() - 1));
  const status = statuses.get(id) ?? { kind: "NONE" as const, label: "予定なし" };
  const activeSites = sites.filter((s) => s.siteStatus === "SURVEY" || s.siteStatus === "ACTIVE");
  const doneSites = sites.filter((s) => !(s.siteStatus === "SURVEY" || s.siteStatus === "ACTIVE"));

  // 担当現場ごとの、この人の人工・人件費（その現場で働いた月だけ計算）
  const siteIds = sites.map((s) => s.id);
  const siteReportDates = siteIds.length
    ? await db.dailyReport.findMany({
        where: { userId: id, siteId: { in: siteIds }, status: "SUBMITTED", absent: false },
        select: { workDate: true },
      })
    : [];
  const siteMonths = [...new Set(siteReportDates.map((r) => storedDateKey(r.workDate).slice(0, 7)))];
  const siteMonthCosts = await Promise.all(siteMonths.map((k) => laborCostForMonth(k)));
  const mySiteCost = new Map<string, { cost: number; manDays: number }>();
  for (const { byUserSite } of siteMonthCosts) {
    for (const sid of siteIds) {
      const c = byUserSite.get(`${id}|${sid}`);
      if (!c) continue;
      const cur = mySiteCost.get(sid) ?? { cost: 0, manDays: 0 };
      cur.cost += c.cost;
      cur.manDays += c.manDays;
      mySiteCost.set(sid, cur);
    }
  }

  // 給与の現在値と、月給なら今月の見込み（月の人件費 ÷ 今月の稼働日数）
  const current = rateOn(rates, today);
  const thisMonth = isCurrent ? month : (await laborCostForMonth(jstMonthKey())).byUser.get(id);
  const estimate =
    current?.payType === "MONTHLY" && current.payAmount != null
      ? {
          monthLabel: `${today.getFullYear()}年${today.getMonth() + 1}月`,
          monthlyTotal: monthlyTotal(current),
          workDays: thisMonth?.workDays ?? 0,
        }
      : null;

  // 今週の予定（配員＋予定）を日付順に
  const week = [
    ...visits.map((v) => ({ key: `v${v.id}`, date: v.date, label: v.site.name, kind: "現場" })),
    ...events.map((e) => ({
      key: `e${e.id}`,
      date: e.date,
      label: e.title,
      kind: EVENT_CATEGORY_LABEL[e.category as EventCategory] ?? "予定",
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const href = (t: string, k = ym) => `/staff/${id}?ym=${k}&tab=${t}`;
  const perDay = month && month.workDays > 0 && month.total > 0 ? month.total / month.workDays : null;

  const siteRow = (s: (typeof sites)[number]) => {
    const c = mySiteCost.get(s.id);
    return (
      <Link key={s.id} href={`/sites/${s.id}`} className="flex items-center gap-3 px-4 py-3 tap-row">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <SiteStatusBadge status={s.siteStatus as SiteStatus} />
            <p className="truncate text-sm font-bold text-ink">{s.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted tnum">
            {c ? `本人 ${Math.round(c.manDays * 10) / 10}人工・${fmtYen(Math.round(c.cost))}` : "本人の稼働なし"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
      </Link>
    );
  };

  return (
    <div>
      <PageHeader
        title={user.name}
        subtitle="スタッフ"
        backHref={`/staff?ym=${ym}`}
        right={
          <Link
            href={`/settings/staff/${id}/edit`}
            className="flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-brand-600 hover:bg-brand-50"
          >
            <Pencil className="h-4 w-4" />
            アカウント
          </Link>
        }
      />
      <PageContainer>
        <div className="space-y-4">
          <Card className="flex items-center gap-3 p-4">
            <Avatar name={user.name} color={user.avatarColor} image={user.avatarImage} size="lg" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{ROLE_LABEL[user.role as Role] ?? user.role}</Badge>
                <span className="text-xs text-ink-muted">{employmentLabelForRole(user.role)}</span>
                {user.department && <span className="text-xs text-ink-muted">{user.department}</span>}
                {!user.active && <Badge tone="danger">無効</Badge>}
              </div>
              {user.active && <DayStatusBadge status={status} />}
              <p className="text-sm text-ink-muted tnum">{payLabel(current) ?? "給与未登録"}</p>
            </div>
          </Card>

          <Tabs
            defaultId={tab}
            tabs={[
              {
                id: "overview",
                label: "概要",
                content: (
                  <div className="space-y-4">
                    <MonthNav
                      monthLabel={monthLabel}
                      isCurrent={isCurrent}
                      prevHref={href("overview", addMonthsKey(ym, -1))}
                      nextHref={href("overview", addMonthsKey(ym, 1))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Stat label="稼働日数" value={`${month?.workDays ?? 0}日`} />
                      <Stat label="稼働時間" value={fmtWorkMinutes(month?.minutes ?? 0)} />
                      <Stat label="人件費" value={month && month.total > 0 ? fmtYen(Math.round(month.total)) : "—"} />
                      <Stat label="1人工" value={perDay != null ? fmtYen(Math.round(perDay)) : "—"} />
                    </div>
                    {month && month.missingRateDays > 0 && (
                      <p className="text-xs font-semibold text-status-danger">
                        給与が未登録の日が {month.missingRateDays} 日あり、人件費に入っていません。
                      </p>
                    )}
                    {rate == null && (
                      <p className="text-xs text-ink-muted">この月に使える給与が登録されていません。</p>
                    )}

                    <div className="space-y-2">
                      <SectionTitle>これから1週間</SectionTitle>
                      {week.length === 0 ? (
                        <p className="px-1 text-sm text-ink-muted">配員・予定はありません。</p>
                      ) : (
                        <Card className="divide-y divide-line overflow-hidden">
                          {week.map((w) => (
                            <div key={w.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                              <p className="w-24 shrink-0 font-semibold text-ink tnum">{fmtDateWithDay(w.date)}</p>
                              <Badge tone={w.kind === "現場" ? "brand" : "neutral"}>{w.kind}</Badge>
                              <p className="min-w-0 flex-1 truncate text-ink">{w.label}</p>
                            </div>
                          ))}
                        </Card>
                      )}
                    </div>

                    <div className="space-y-2">
                      <SectionTitle>担当現場（進行中）</SectionTitle>
                      {activeSites.length === 0 ? (
                        <p className="px-1 text-sm text-ink-muted">進行中の担当現場はありません。</p>
                      ) : (
                        <Card className="divide-y divide-line overflow-hidden">{activeSites.map(siteRow)}</Card>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                id: "work",
                label: "稼働時間",
                content: (
                  <div className="space-y-4">
                    <MonthNav
                      monthLabel={monthLabel}
                      isCurrent={isCurrent}
                      prevHref={href("work", addMonthsKey(ym, -1))}
                      nextHref={href("work", addMonthsKey(ym, 1))}
                    />
                    <p className="px-1 text-sm text-ink-muted tnum">
                      合計 <b className="text-ink">{fmtWorkMinutes(work.totalMinutes)}</b>・{work.days.length}日
                    </p>
                    <WorkDayList days={work.days} />
                  </div>
                ),
              },
              {
                id: "pay",
                label: "給与・人件費",
                content: (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <SectionTitle>年ごとの給与</SectionTitle>
                      {rates.length === 0 ? (
                        <p className="px-1 text-sm text-ink-muted">まだ給与が登録されていません。</p>
                      ) : (
                        <YearlyPay rates={rates} today={today} />
                      )}
                    </div>
                    <div className="space-y-2">
                      <SectionTitle>月ごとの人件費（直近12か月）</SectionTitle>
                      <MonthlyCostTable rows={months.map((k, i) => ({ ym: k, month: monthCosts[i].byUser.get(id) }))} />
                    </div>
                    <div className="space-y-2">
                      <SectionTitle>給与の履歴・登録</SectionTitle>
                      <PayRateManager
                        userId={user.id}
                        role={user.role}
                        currentId={current?.id ?? null}
                        todayKey={todayKey}
                        estimate={estimate}
                        rates={rates.map((r) => ({
                          id: r.id,
                          payType: r.payType,
                          payAmount: r.payAmount,
                          socialInsurance: r.socialInsurance,
                          bonusMonthly: r.bonusMonthly,
                          otherCost: r.otherCost,
                          effectiveFromKey: storedDateKey(r.effectiveFrom),
                        }))}
                      />
                    </div>
                  </div>
                ),
              },
              {
                id: "sites",
                label: "担当現場",
                count: activeSites.length,
                content:
                  sites.length === 0 ? (
                    <EmptyState title="担当現場はありません" description="現場の登録・編集で「現場担当者」に設定すると表示されます。" />
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <SectionTitle>進行中（{activeSites.length}）</SectionTitle>
                        {activeSites.length > 0 && (
                          <Card className="divide-y divide-line overflow-hidden">{activeSites.map(siteRow)}</Card>
                        )}
                      </div>
                      {doneSites.length > 0 && (
                        <div className="space-y-2">
                          <SectionTitle>完了・見送り（{doneSites.length}）</SectionTitle>
                          <Card className="divide-y divide-line overflow-hidden">{doneSites.map(siteRow)}</Card>
                        </div>
                      )}
                      <p className="px-1 text-[11px] text-ink-faint">
                        人工・人件費は、この人がその現場で出した提出済みの日報から計算しています（1日に2現場なら半分ずつ）。
                      </p>
                    </div>
                  ),
              },
            ]}
          />
        </div>
      </PageContainer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-sunken px-3 py-2.5">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-ink tnum">{value}</p>
    </div>
  );
}
