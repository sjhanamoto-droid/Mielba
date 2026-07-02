import Link from "next/link";
import {
  FileText, AlertTriangle, CalendarClock, ChevronRight, HardHat,
  CheckSquare, Truck, PackageCheck, Plus, ClipboardList,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { AppMenu } from "@/components/app-shell/app-menu";
import { PageContainer } from "@/components/app-shell/page-container";
import { SiteCard } from "@/components/site-card";
import { TodoItem } from "@/components/todo-item";
import { StatTile, EmptyState } from "@/components/ui/misc";
import { SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { fmtDateWithDay, dueLabel, isOverdue, isToday } from "@/lib/utils";
import { EVENT_SOURCE_LABEL, EVENT_SOURCE_COLOR, type EventSource } from "@/lib/constants";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "お疲れさまです";
  if (h < 11) return "おはようございます";
  if (h < 18) return "お疲れさまです";
  return "お疲れさまです";
}

export default async function HomePage() {
  const user = await requireUser();
  const admin = isAdmin(user);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 担当現場（進行中）
  const activeSites = await db.site.findMany({
    where: {
      siteStatus: "ACTIVE",
      ...(admin ? {} : { assignments: { some: { userId: user.id } } }),
    },
    include: {
      customer: { select: { name: true } },
      assignments: { select: { userId: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // 今日の現場入り（出面）。日報・未提出はこれに連動（配属ではなく「当日行く現場」）。
  const todayVisits = await db.siteVisit.findMany({
    where: { userId: user.id, date: { gte: today, lt: tomorrow } },
    include: { site: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // 本日分の自分の日報（状態判定用）— ステータス込みで取得
  const myReportsToday = await db.dailyReport.findMany({
    where: { userId: user.id, workDate: { gte: today, lt: tomorrow } },
    select: { id: true, siteId: true, status: true },
  });
  const reportBySiteId = new Map(myReportsToday.map((r) => [r.siteId, r]));

  // 現場入りした現場を「未打刻(日報なし)」「未提出(下書きあり)」に分離（提出済は除外）
  const visitSites = todayVisits.map((v) => ({ id: v.siteId, name: v.site.name }));
  const sitesNotStarted = visitSites.filter((s) => !reportBySiteId.has(s.id));
  const sitesDraft = visitSites.filter(
    (s) => reportBySiteId.get(s.id)?.status === "DRAFT",
  );

  // 管理者向け：今日の配員サマリー（全スタッフの現場入りと提出状況）
  let dispatchSummary = { going: 0, submitted: 0, pending: 0 };
  if (admin) {
    const allVisitsToday = await db.siteVisit.findMany({
      where: { date: { gte: today, lt: tomorrow } },
      select: { siteId: true, userId: true },
    });
    if (allVisitsToday.length > 0) {
      const subs = await db.dailyReport.findMany({
        where: { status: "SUBMITTED", workDate: { gte: today, lt: tomorrow } },
        select: { siteId: true, userId: true },
      });
      const subSet = new Set(subs.map((r) => `${r.siteId}_${r.userId}`));
      const submitted = allVisitsToday.filter((v) => subSet.has(`${v.siteId}_${v.userId}`)).length;
      dispatchSummary = {
        going: allVisitsToday.length,
        submitted,
        pending: allVisitsToday.length - submitted,
      };
    }
  }

  // 自分宛の未対応TODO
  const myTodos = await db.todo.findMany({
    where: { assigneeId: user.id, status: { not: "DONE" } },
    include: { site: { select: { id: true, name: true } }, assignee: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }],
  });
  const overdueTodos = myTodos.filter((t) => isOverdue(t.dueDate));
  // 自分宛で本日締切のTODO（期限切れは別枠なので除外）
  const todayDueTodos = myTodos.filter(
    (t) => t.dueDate && isToday(t.dueDate) && !isOverdue(t.dueDate),
  );

  // 本日の予定
  const todayEvents = await db.calendarEvent.findMany({
    where: {
      date: { gte: today, lt: tomorrow },
      ...(admin
        ? {}
        : { OR: [{ ownerId: user.id }, { site: { assignments: { some: { userId: user.id } } } }] }),
    },
    include: { site: { select: { id: true, name: true } } },
    orderBy: [{ startTime: "asc" }],
  });

  // 本日の現場予定のうち 配達(DELIVERY)/支給品(SUPPLY) は上部に通知として引き上げる
  const deliveryEvents = todayEvents.filter(
    (e) => e.source === "DELIVERY" || e.source === "SUPPLY",
  );

  // 統計（管理者向け）
  const [surveyCount, openTodoCount] = await Promise.all([
    admin ? db.site.count({ where: { siteStatus: "SURVEY" } }) : Promise.resolve(0),
    db.todo.count({ where: { assigneeId: user.id, status: { not: "DONE" } } }),
  ]);

  return (
    <div>
      {/* ヘッダー */}
      <header className="bg-gradient-to-b from-brand-700 to-brand-600 px-4 pb-5 pt-3 safe-top text-white md:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-100">{greeting()}</p>
              <p className="text-lg font-bold leading-tight md:text-xl">{user.name} さん</p>
            </div>
            <AppMenu user={user} />
          </div>
          <p className="mt-3 text-xs font-medium text-brand-100">{fmtDateWithDay(today)}</p>
        </div>
      </header>

      <PageContainer className="space-y-5">
        {/* 次にやること */}
        <section className="space-y-2.5">
          <SectionTitle>次にやること</SectionTitle>

          {/* 未打刻（本日・日報なし） */}
          {sitesNotStarted.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50">
              <div className="flex items-center gap-2 px-4 pt-3 text-sm font-bold text-red-700">
                <FileText className="h-4 w-4" />
                未打刻です（本日・日報なし）
                <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  {sitesNotStarted.length}
                </span>
              </div>
              <div className="divide-y divide-red-100">
                {sitesNotStarted.map((s) => (
                  <Link
                    key={s.id}
                    href={`/reports/new?siteId=${s.id}`}
                    className="flex items-center justify-between gap-2 px-4 py-3 active:bg-red-100/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                      <p className="truncate text-xs text-red-600">タップで日報を作成・打刻</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white">
                      <Plus className="h-3.5 w-3.5" />作成
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 未提出（打刻済・下書きのまま） */}
          {sitesDraft.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 px-4 pt-3 text-sm font-bold text-amber-800">
                <FileText className="h-4 w-4" />
                未提出です（下書きのまま）
                <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {sitesDraft.length}
                </span>
              </div>
              <div className="divide-y divide-amber-100">
                {sitesDraft.map((s) => (
                  <Link
                    key={s.id}
                    href={`/reports/${reportBySiteId.get(s.id)!.id}`}
                    className="flex items-center justify-between gap-2 px-4 py-3 active:bg-amber-100/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                      <p className="truncate text-xs text-amber-700">タップで下書きを確認・提出</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">
                      下書き
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 今日の現場入りがすべて提出済みのとき */}
          {todayVisits.length > 0 &&
            sitesNotStarted.length === 0 &&
            sitesDraft.length === 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                <CheckSquare className="h-4 w-4" />
                本日の日報・勤怠はすべて提出済みです
              </div>
            )}

          {/* 管理者：今日の配員サマリー（→配員ボード） */}
          {admin && (
            <Link
              href="/dispatch"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:bg-surface-subtle"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <HardHat className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">今日の配員（現場入り）</p>
                <p className="text-xs text-ink-muted">
                  {dispatchSummary.going > 0
                    ? `${dispatchSummary.going}名が現場入り ・ 日報 提出 ${dispatchSummary.submitted} / 未提出 ${dispatchSummary.pending}`
                    : "まだ配員が組まれていません。タップして登録"}
                </p>
              </div>
              {dispatchSummary.pending > 0 && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  未提出 {dispatchSummary.pending}
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
          )}

          {/* スタッフ：今日の現場入りが無い場合の案内 */}
          {!admin && todayVisits.length === 0 && (
            <Link
              href="/reports"
              className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted active:bg-surface-subtle"
            >
              <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
              <span className="flex-1">今日の現場入りはまだありません</span>
              <span className="text-xs font-semibold text-brand-600">日報から追加</span>
            </Link>
          )}

          {/* 本日の配達・支給品予定の通知 */}
          {deliveryEvents.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {deliveryEvents.map((e) => {
                const color = EVENT_SOURCE_COLOR[e.source as EventSource];
                const Icon = e.source === "DELIVERY" ? Truck : PackageCheck;
                const href = e.site ? `/sites/${e.site.id}` : "/calendar";
                return (
                  <Link
                    key={e.id}
                    href={href}
                    className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 active:bg-surface-subtle"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                      <p className="truncate text-xs text-ink-muted">
                        本日 {EVENT_SOURCE_LABEL[e.source as EventSource]}
                        {e.site ? `・${e.site.name}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </Link>
                );
              })}
            </div>
          )}

          {/* 期限切れTODO */}
          {overdueTodos.length > 0 && (
            <Link
              href="/todos"
              className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 active:bg-red-100"
            >
              <AlertTriangle className="h-4 w-4 text-status-danger" />
              <span className="flex-1 text-sm font-semibold text-red-600">
                期限切れのTODOが {overdueTodos.length} 件あります
              </span>
              <ChevronRight className="h-4 w-4 text-red-400" />
            </Link>
          )}

          {/* 本日締切のTODO（自分宛） */}
          {todayDueTodos.length > 0 && (
            <Link
              href="/todos"
              className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 active:bg-amber-100"
            >
              <CalendarClock className="h-4 w-4 text-amber-600" />
              <span className="flex-1 text-sm font-semibold text-amber-700">
                本日締切のTODOが {todayDueTodos.length} 件あります
              </span>
              <ChevronRight className="h-4 w-4 text-amber-400" />
            </Link>
          )}
        </section>

        {/* 統計タイル */}
        <section className="grid grid-cols-3 gap-2.5 lg:gap-4">
          <StatTile label="担当の進行中" value={activeSites.length} tone="brand" href="/sites?status=ACTIVE" />
          <StatTile label="未対応TODO" value={openTodoCount} tone={openTodoCount > 0 ? "warn" : "neutral"} href="/todos" />
          {admin ? (
            <StatTile label="現調中" value={surveyCount} tone="neutral" href="/sites?status=SURVEY" />
          ) : (
            <StatTile label="本日の予定" value={todayEvents.length} tone="neutral" href="/calendar" />
          )}
        </section>

        {/* メインコンテンツ：PCでは2カラム、スマホは縦積み */}
        <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {/* 本日の予定 */}
        <section className="space-y-2.5">
          <SectionTitle action={<Link href="/calendar" className="text-xs font-semibold text-brand-600">カレンダー</Link>}>
            本日の予定
          </SectionTitle>
          {todayEvents.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
              本日の予定はありません
            </div>
          ) : (
            <div className="card divide-y divide-line">
              {todayEvents.map((e) => {
                const color = EVENT_SOURCE_COLOR[e.source as EventSource];
                const Icon = e.source === "DELIVERY" ? Truck : e.source === "SUPPLY" ? PackageCheck : CalendarClock;
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1a`, color }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                      {e.site && <p className="truncate text-xs text-ink-muted">{e.site.name}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone="neutral">{EVENT_SOURCE_LABEL[e.source as EventSource]}</Badge>
                      {!e.allDay && e.startTime && (
                        <p className="mt-0.5 text-xs font-bold tnum text-ink-soft">{e.startTime}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 自分宛TODO */}
        {myTodos.length > 0 && (
          <section className="space-y-2.5">
            <SectionTitle action={<Link href="/todos" className="text-xs font-semibold text-brand-600">すべて</Link>}>
              自分のTODO
            </SectionTitle>
            <div className="space-y-2">
              {myTodos.slice(0, 6).map((t) => (
                <TodoItem key={t.id} todo={t} />
              ))}
            </div>
          </section>
        )}

        {/* 担当現場（PCでは全幅に並べる） */}
        <section className="space-y-2.5 lg:col-span-2">
          <SectionTitle action={<Link href="/sites" className="text-xs font-semibold text-brand-600">すべて</Link>}>
            {admin ? "進行中の現場" : "担当現場"}
          </SectionTitle>
          {activeSites.length === 0 ? (
            <EmptyState
              icon={<HardHat className="h-6 w-6" />}
              title="担当の進行中現場はありません"
              description={admin ? "現場を作成してください" : "管理者が現場に割り当てると表示されます"}
              action={admin ? <LinkButton href="/sites/new" size="sm"><Plus className="h-4 w-4" />現場を作成</LinkButton> : undefined}
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {activeSites.slice(0, 9).map((s) => (
                <SiteCard key={s.id} site={s} />
              ))}
            </div>
          )}
        </section>
        </div>

        {admin && (
          <Link href="/customers" className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 active:bg-surface-subtle">
            <ClipboardList className="h-5 w-5 text-brand-600" />
            <span className="flex-1 text-sm font-semibold text-ink">顧客（元請企業）を管理</span>
            <ChevronRight className="h-4 w-4 text-ink-faint" />
          </Link>
        )}
      </PageContainer>
    </div>
  );
}
