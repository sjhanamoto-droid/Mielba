import Link from "next/link";
import {
  FileText, CalendarClock, ChevronRight, HardHat,
  CheckSquare, Truck, PackageCheck, Plus, ClipboardList,
  AlertTriangle, MapPin, Users, ArrowRight, Sun,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstDateKey, todayRange, tomorrowKey, dayRangeForKey, dateFromKey } from "@/lib/date";
import { AppMenu } from "@/components/app-shell/app-menu";
import { PageContainer } from "@/components/app-shell/page-container";
import { SiteCard } from "@/components/site-card";
import { mapSearchUrl } from "@/lib/utils";
import { TodoItem } from "@/components/todo-item";
import { HandoverAlert } from "@/components/handover-alert";
import { StatTile, EmptyState } from "@/components/ui/misc";
import { SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { cn, fmtDateWithDay, fmtMonthDay } from "@/lib/utils";
import { EVENT_SOURCE_LABEL, EVENT_SOURCE_COLOR, type EventSource } from "@/lib/constants";

function greeting(): string {
  // 日本時間の時刻で挨拶を切り替える（サーバーが UTC でもずれないように）
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false })
      .format(new Date()),
  );
  if (h >= 5 && h < 11) return "おはようございます";
  return "お疲れさまです";
}

// ── ホーム「次にやること」のタスク表現 ──
type TaskTone = "danger" | "warn" | "info";
type HomeTask = {
  key: string;
  tone: TaskTone; // 赤=至急 / 黄=今日中 / 青=情報
  title: string;
  sub?: string;
  href: string;
  cta: string;
};

const TONE_HERO: Record<TaskTone, string> = {
  danger: "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40",
  warn: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40",
  info: "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/40",
};
const TONE_NUMBER: Record<TaskTone, string> = {
  danger: "bg-red-500 text-white",
  warn: "bg-amber-500 text-white",
  info: "bg-blue-500 text-white",
};
const TONE_TEXT: Record<TaskTone, string> = {
  danger: "text-red-700 dark:text-red-300",
  warn: "text-amber-700 dark:text-amber-300",
  info: "text-blue-700 dark:text-blue-300",
};

export default async function HomePage() {
  const user = await requireUser();
  const admin = isAdmin(user);

  // 「今日」は日本時間の暦日で判定する（UTC サーバーで朝9時まで前日扱いになるバグの修正）
  const todayKey = jstDateKey();
  const today = todayRange(); // { gte, lt }
  const tmrwKey = tomorrowKey();
  const tomorrow = dayRangeForKey(tmrwKey);

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
    where: { userId: user.id, date: today },
    include: { site: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // 本日分の自分の日報（状態判定用）— ステータス込みで取得
  const myReportsToday = await db.dailyReport.findMany({
    where: { userId: user.id, workDate: today },
    select: { id: true, siteId: true, status: true },
  });
  const reportBySiteId = new Map(myReportsToday.map((r) => [r.siteId, r]));

  // 現場入りした現場を「未打刻(日報なし)」「未提出(下書きあり)」に分離（提出済は除外）
  const visitSites = todayVisits.map((v) => ({ id: v.siteId, name: v.site.name }));
  const sitesNotStarted = visitSites.filter((s) => !reportBySiteId.has(s.id));
  const sitesDraft = visitSites.filter(
    (s) => reportBySiteId.get(s.id)?.status === "DRAFT",
  );

  // 今日行く現場の未解決の引き継ぎ事項（スタッフ向けにホームでも確認できるように）
  const visitSiteIds = visitSites.map((s) => s.id);
  let openHandovers: { id: string; content: string; createdAt: Date; createdByName?: string }[] = [];
  if (visitSiteIds.length > 0) {
    const handovers = await db.handover.findMany({
      where: { siteId: { in: visitSiteIds }, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true, createdAt: true, createdById: true, site: { select: { name: true } } },
    });
    const creatorIds = Array.from(
      new Set(handovers.map((h) => h.createdById).filter((v): v is string => !!v)),
    );
    const creators = creatorIds.length
      ? await db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(creators.map((u) => [u.id, u.name]));
    openHandovers = handovers.map((h) => ({
      id: h.id,
      // どの現場の引き継ぎか分かるよう現場名を前置する
      content: visitSiteIds.length > 1 ? `【${h.site.name}】${h.content}` : h.content,
      createdAt: h.createdAt,
      createdByName: h.createdById ? nameById.get(h.createdById) : undefined,
    }));
  }

  // 管理者向け：今日の配員サマリー（全スタッフの現場入りと提出状況）
  let dispatchSummary = { going: 0, submitted: 0, pending: 0 };
  if (admin) {
    const allVisitsToday = await db.siteVisit.findMany({
      where: { date: today },
      select: { siteId: true, userId: true },
    });
    if (allVisitsToday.length > 0) {
      const subs = await db.dailyReport.findMany({
        where: { status: "SUBMITTED", workDate: today },
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

  // 自分宛の未対応TODO（期限判定は日本時間の暦日キーで行う）
  const myTodos = await db.todo.findMany({
    where: { assigneeId: user.id, status: { not: "DONE" } },
    include: { site: { select: { id: true, name: true } }, assignee: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }],
  });
  const dueKey = (d: Date | null) => (d ? jstDateKey(d) : null);
  const overdueTodos = myTodos.filter((t) => {
    const k = dueKey(t.dueDate);
    return k !== null && k < todayKey;
  });
  const todayDueTodos = myTodos.filter((t) => dueKey(t.dueDate) === todayKey);

  // 本日の予定
  const todayEvents = await db.calendarEvent.findMany({
    where: {
      date: today,
      ...(admin
        ? {}
        : { OR: [{ ownerId: user.id }, { site: { assignments: { some: { userId: user.id } } } }] }),
    },
    include: { site: { select: { id: true, name: true } } },
    orderBy: [{ startTime: "asc" }],
  });

  // 本日の配達(DELIVERY)/支給品(SUPPLY)予定は「情報」タスクとして知らせる
  const deliveryEvents = todayEvents.filter(
    (e) => e.source === "DELIVERY" || e.source === "SUPPLY",
  );

  // 明日の現場入り（自分の分）。管理者は全体の配員状況も確認する。
  const myTomorrowVisits = await db.siteVisit.findMany({
    where: { userId: user.id, date: tomorrow },
    include: { site: { select: { id: true, name: true, address: true } } },
    orderBy: { createdAt: "asc" },
  });
  const tomorrowGoingCount = admin
    ? await db.siteVisit.count({ where: { date: tomorrow } })
    : 0;

  // 統計（管理者向け）
  const [surveyCount, openTodoCount] = await Promise.all([
    admin ? db.site.count({ where: { siteStatus: "SURVEY" } }) : Promise.resolve(0),
    db.todo.count({ where: { assigneeId: user.id, status: { not: "DONE" } } }),
  ]);

  // ── 「次にやること」を優先度順に組み立てる ──
  // 優先順: 未打刻 > 未解決の引き継ぎ確認 > 未提出下書き > 期限切れTODO > 本日締切TODO > 情報（配達等）
  const tasks: HomeTask[] = [
    ...sitesNotStarted.map((s) => ({
      key: `report-${s.id}`,
      tone: "danger" as const,
      title: "日報を書く（未打刻）",
      sub: s.name,
      href: `/reports/new?siteId=${s.id}`,
      cta: "日報を書く",
    })),
    ...(openHandovers.length > 0
      ? [{
          key: "handovers",
          tone: "warn" as const,
          title: `引き継ぎ事項を確認する（${openHandovers.length}件）`,
          sub: "前の担当者からの申し送りがあります",
          href: "#handovers",
          cta: "内容を確認",
        }]
      : []),
    ...sitesDraft.map((s) => ({
      key: `draft-${s.id}`,
      tone: "warn" as const,
      title: "日報の下書きを提出する",
      sub: s.name,
      href: `/reports/${reportBySiteId.get(s.id)!.id}`,
      cta: "下書きを開く",
    })),
    ...(overdueTodos.length > 0
      ? [{
          key: "overdue-todos",
          tone: "danger" as const,
          title: `期限切れのTODOに対応する（${overdueTodos.length}件）`,
          sub: overdueTodos[0]?.title,
          href: "/todos",
          cta: "TODOを開く",
        }]
      : []),
    ...(todayDueTodos.length > 0
      ? [{
          key: "today-todos",
          tone: "warn" as const,
          title: `本日締切のTODOを片付ける（${todayDueTodos.length}件）`,
          sub: todayDueTodos[0]?.title,
          href: "/todos",
          cta: "TODOを開く",
        }]
      : []),
    ...deliveryEvents.map((e) => ({
      key: `event-${e.id}`,
      tone: "info" as const,
      title: `本日 ${EVENT_SOURCE_LABEL[e.source as EventSource]}：${e.title}`,
      sub: e.site?.name ?? undefined,
      href: e.site ? `/sites/${e.site.id}` : "/calendar",
      cta: "詳細を見る",
    })),
  ];

  const heroTask = tasks[0];
  const restTasks = tasks.slice(1);

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
          <p className="mt-3 text-xs font-medium text-brand-100">{fmtDateWithDay(dateFromKey(todayKey))}</p>
        </div>
      </header>

      <PageContainer className="space-y-5">
        {/* 次にやること */}
        <section className="space-y-2.5">
          <SectionTitle>次にやること</SectionTitle>

          {tasks.length === 0 ? (
            /* 全部完了 */
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-900/60 dark:bg-emerald-950/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <CheckSquare className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">本日のタスクは完了です</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">お疲れさまでした。予定と現場は下で確認できます。</p>
              </div>
            </div>
          ) : (
            <>
              {/* 最優先タスク：大きなヒーローカード */}
              <div className={cn("rounded-2xl border p-4", TONE_HERO[heroTask.tone])}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    TONE_NUMBER[heroTask.tone],
                  )}>
                    いま最優先
                  </span>
                  {heroTask.tone === "danger" && (
                    <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden />
                  )}
                </div>
                <p className={cn("mt-2.5 text-lg font-bold leading-snug", TONE_TEXT[heroTask.tone])}>
                  {heroTask.title}
                </p>
                {heroTask.sub && (
                  <p className="mt-0.5 truncate text-sm font-medium text-ink-soft">{heroTask.sub}</p>
                )}
                <LinkButton href={heroTask.href} size="lg" className="mt-3 w-full">
                  {heroTask.cta}
                  <ArrowRight className="h-5 w-5" />
                </LinkButton>
              </div>

              {/* 残りタスク：番号付きチェックリスト（重要度順） */}
              {restTasks.length > 0 && (
                <ol className="card divide-y divide-line">
                  {restTasks.map((t, i) => (
                    <li key={t.key}>
                      <Link
                        href={t.href}
                        className="flex items-center gap-3 px-4 py-3 active:bg-surface-subtle"
                      >
                        <span className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tnum",
                          TONE_NUMBER[t.tone],
                        )}>
                          {i + 2}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm font-bold", TONE_TEXT[t.tone])}>{t.title}</p>
                          {t.sub && <p className="truncate text-xs text-ink-muted">{t.sub}</p>}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {/* 今日行く現場の引き継ぎ事項（「確認して停止」でその場で解決できる） */}
          {openHandovers.length > 0 && (
            <div id="handovers" className="scroll-mt-4">
              <HandoverAlert handovers={openHandovers} />
            </div>
          )}

          {/* 管理者：今日の配員サマリー（→配員ボード） */}
          {admin && (
            <Link
              href="/dispatch"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:bg-surface-subtle"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Users className="h-5 w-5" />
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
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-center text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  未提出 {dispatchSummary.pending}
                  <span className="block text-[10px] font-semibold">配員ボードで確認</span>
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
        </section>

        {/* 明日の現場入り */}
        {(myTomorrowVisits.length > 0 || admin) && (
          <section className="space-y-2.5">
            <SectionTitle>明日の現場入り</SectionTitle>
            {myTomorrowVisits.length > 0 ? (
              <div className="card divide-y divide-line">
                {myTomorrowVisits.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <Sun className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink-muted">
                        明日 {fmtMonthDay(dateFromKey(tmrwKey))} は
                      </p>
                      <Link href={`/sites/${v.site.id}`} className="block truncate text-sm font-bold text-ink">
                        {v.site.name}
                      </Link>
                      {v.site.address && (
                        <a
                          href={mapSearchUrl(v.site.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 flex items-center gap-1 text-xs font-medium text-brand-600"
                        >
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate underline underline-offset-2">{v.site.address}</span>
                        </a>
                      )}
                    </div>
                    <Link href={`/sites/${v.site.id}`} aria-label="現場詳細へ">
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : admin && tomorrowGoingCount === 0 ? (
              <Link
                href={`/dispatch?d=${tmrwKey}`}
                className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 active:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40"
              >
                <Users className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                <span className="flex-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  明日の配員が未設定です
                </span>
                <span className="text-xs font-bold text-brand-600">配員ボードへ</span>
                <ChevronRight className="h-4 w-4 text-amber-400" />
              </Link>
            ) : admin ? (
              <Link
                href={`/dispatch?d=${tmrwKey}`}
                className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted active:bg-surface-subtle"
              >
                <Users className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="flex-1">明日は {tomorrowGoingCount}名が現場入り予定</span>
                <span className="text-xs font-semibold text-brand-600">配員ボードで確認</span>
              </Link>
            ) : null}
          </section>
        )}

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
