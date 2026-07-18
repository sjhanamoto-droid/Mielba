import Link from "next/link";
import {
  FileText, CalendarClock, ChevronRight, HardHat,
  CheckSquare, Truck, PackageCheck, Plus, ClipboardList,
  AlertTriangle, MapPin, Users, ArrowRight, Sun,
  LayoutDashboard, Megaphone, CalendarDays, Lightbulb,
  LifeBuoy, PenLine, Building2, type LucideIcon,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstDateKey, todayRange, tomorrowKey, dayRangeForKey, dateFromKey, addDaysKey } from "@/lib/date";
import { AppMenu } from "@/components/app-shell/app-menu";
import { PageContainer } from "@/components/app-shell/page-container";
import { SiteCard } from "@/components/site-card";
import { mapSearchUrl } from "@/lib/utils";
import { HandoverAlert } from "@/components/handover-alert";
import { StatTile, EmptyState } from "@/components/ui/misc";
import { IconBadge, type IconTone } from "@/components/ui/icon-badge";
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

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

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

// 参考デザインのグラデカードに入れる控えめな装飾（ドット・ネットワーク＝現場のつながりを表す抽象モチーフ）
function CardMotif() {
  return (
    <svg
      className="pointer-events-none absolute -right-3 -top-3 h-24 w-24 opacity-25"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
    >
      <path d="M68 26 L90 50 M68 26 L54 58 M90 50 L54 58 M90 50 L84 78" stroke="white" strokeWidth="1.6" />
      <circle cx="68" cy="26" r="4.5" fill="white" />
      <circle cx="90" cy="50" r="3.5" fill="white" />
      <circle cx="54" cy="58" r="3.5" fill="white" />
      <circle cx="84" cy="78" r="3" fill="white" />
    </svg>
  );
}

// 右レールのクイック操作 1 行
function QuickAction({
  href,
  label,
  icon,
  tone,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: IconTone;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-subtle active:bg-surface-subtle"
    >
      <IconBadge icon={icon} tone={tone} size="sm" />
      <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
    </Link>
  );
}

// 日報の到着状況（管理者）の小さな集計チップ
function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "brand" | "emerald" | "amber";
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  };
  return (
    <div className={cn("rounded-xl px-3 py-2 text-center", tones[tone])}>
      <p className="text-xl font-bold tnum leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-semibold opacity-90">{label}</p>
    </div>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  const admin = isAdmin(user);

  // 「今日」は日本時間の暦日で判定する（UTC サーバーで朝9時まで前日扱いになるバグの修正）
  const todayKey = jstDateKey();
  const today = todayRange(); // { gte, lt }
  const tmrwKey = tomorrowKey();
  const tomorrow = dayRangeForKey(tmrwKey);

  // ── 今週のカレンダー範囲（週ストリップ用）。DBアクセス前に確定させる ──
  // 日曜起点の7日。各日に「予定の出所色ドット」と「自分の現場入り」を集約する。
  const weekStartKey = addDaysKey(todayKey, -dateFromKey(todayKey).getDay());
  const weekDayKeys = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStartKey, i));
  const weekStart = dateFromKey(weekStartKey);
  const weekEnd = dateFromKey(addDaysKey(weekStartKey, 7));

  // ── 互いに独立したクエリはすべて 1 波で並列取得する ──
  //    本番の PostgreSQL は「1 クエリ = 1 ネットワーク往復」。直列に await すると
  //    往復回数ぶん待ち時間が積み上がるため、依存の無いものは Promise.all でまとめる。
  //    （visitSiteIds に依存する引き継ぎ照会だけは後段の第2波で取得）
  const emptyPairs: { siteId: string; userId: string }[] = [];
  const [
    activeSites,
    todayVisits,
    myReportsToday,
    todayEvents,
    weekEvents,
    weekVisits,
    myTomorrowVisits,
    allVisitsToday,
    submittedToday,
    tomorrowGoingCount,
    surveyCount,
  ] = await Promise.all([
    // 担当現場（進行中）
    db.site.findMany({
      where: {
        siteStatus: "ACTIVE",
        ...(admin ? {} : { assignments: { some: { userId: user.id } } }),
      },
      include: {
        customer: { select: { name: true } },
        assignments: { select: { userId: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // 今日の現場入り（出面）。日報・未提出はこれに連動（配属ではなく「当日行く現場」）。
    db.siteVisit.findMany({
      where: { userId: user.id, date: today },
      include: { site: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    // 本日分の自分の日報（状態判定用）— ステータス込みで取得
    db.dailyReport.findMany({
      where: { userId: user.id, workDate: today },
      select: { id: true, siteId: true, status: true },
    }),
    // 本日の予定
    db.calendarEvent.findMany({
      where: {
        date: today,
        ...(admin
          ? {}
          : { OR: [{ ownerId: user.id }, { site: { assignments: { some: { userId: user.id } } } }] }),
      },
      include: { site: { select: { id: true, name: true } } },
      orderBy: [{ startTime: "asc" }],
    }),
    // 今週の予定（週ストリップの出所色ドット用）
    db.calendarEvent.findMany({
      where: {
        date: { gte: weekStart, lt: weekEnd },
        ...(admin
          ? {}
          : {
              OR: [
                { ownerId: user.id },
                { site: { assignments: { some: { userId: user.id } } } },
                { participants: { some: { userId: user.id } } },
              ],
            }),
      },
      select: { id: true, date: true, source: true },
    }),
    // 今週の自分の現場入り
    db.siteVisit.findMany({
      where: { userId: user.id, date: { gte: weekStart, lt: weekEnd } },
      select: { date: true },
    }),
    // 明日の現場入り（自分の分）
    db.siteVisit.findMany({
      where: { userId: user.id, date: tomorrow },
      include: { site: { select: { id: true, name: true, address: true } } },
      orderBy: { createdAt: "asc" },
    }),
    // 管理者向け：今日の全スタッフの現場入り（配員サマリー用）
    admin
      ? db.siteVisit.findMany({
          where: { date: today },
          select: { siteId: true, userId: true },
        })
      : Promise.resolve(emptyPairs),
    // 管理者向け：今日の提出済み日報（配員サマリー用）
    admin
      ? db.dailyReport.findMany({
          where: { status: "SUBMITTED", workDate: today },
          select: { siteId: true, userId: true },
        })
      : Promise.resolve(emptyPairs),
    // 管理者向け：明日の全体現場入り件数
    admin ? db.siteVisit.count({ where: { date: tomorrow } }) : Promise.resolve(0),
    // 統計（管理者向け）：調査中の現場数
    admin ? db.site.count({ where: { siteStatus: "SURVEY" } }) : Promise.resolve(0),
  ]);

  const reportBySiteId = new Map(myReportsToday.map((r) => [r.siteId, r]));

  // 現場入りした現場を「未打刻(日報なし)」「未提出(下書きあり)」に分離（提出済は除外）
  const visitSites = todayVisits.map((v) => ({ id: v.siteId, name: v.site.name }));
  const sitesNotStarted = visitSites.filter((s) => !reportBySiteId.has(s.id));
  const sitesDraft = visitSites.filter(
    (s) => reportBySiteId.get(s.id)?.status === "DRAFT",
  );
  // スタッフの日報到着状況（自分の当日提出状況）
  const mySubmittedCount = visitSites.filter(
    (s) => reportBySiteId.get(s.id)?.status === "SUBMITTED",
  ).length;

  // 本日の配達(DELIVERY)/支給品(SUPPLY)予定は「情報」タスクとして知らせる
  const deliveryEvents = todayEvents.filter(
    (e) => e.source === "DELIVERY" || e.source === "SUPPLY",
  );

  // 週ストリップの集計（取得済みデータから組み立てる）
  const weekSourcesByDay = new Map<string, string[]>();
  for (const e of weekEvents) {
    const k = jstDateKey(e.date);
    const arr = weekSourcesByDay.get(k);
    if (arr) arr.push(e.source);
    else weekSourcesByDay.set(k, [e.source]);
  }
  const weekVisitDays = new Set(weekVisits.map((v) => jstDateKey(v.date)));
  const weekEventCount = weekEvents.length;

  // 管理者向け：今日の配員サマリー（全スタッフの現場入りと提出状況）
  let dispatchSummary = { going: 0, submitted: 0, pending: 0 };
  if (admin && allVisitsToday.length > 0) {
    const subSet = new Set(submittedToday.map((r) => `${r.siteId}_${r.userId}`));
    const submitted = allVisitsToday.filter((v) => subSet.has(`${v.siteId}_${v.userId}`)).length;
    dispatchSummary = {
      going: allVisitsToday.length,
      submitted,
      pending: allVisitsToday.length - submitted,
    };
  }

  // 今日行く現場の未解決の引き継ぎ事項（visitSiteIds に依存するので第2波で取得）
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

  // ── 「次にやること」を優先度順に組み立てる ──
  // 優先順: 未打刻 > 未解決の引き継ぎ確認 > 未提出下書き > 情報（配達等）
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

  // スタッフの日報 1 行のリンク先（状態で遷移先が変わる）
  function staffReportHref(status: string | undefined, siteId: string, reportId?: string): string {
    if (status === "SUBMITTED" && reportId) return `/reports/${reportId}`;
    if (status === "DRAFT" && reportId) return `/reports/${reportId}/edit`;
    return `/reports/new?siteId=${siteId}`;
  }

  // 右レールのクイック操作（役割別）
  const quickActions: { href: string; label: string; icon: LucideIcon; tone: IconTone }[] = admin
    ? [
        { href: "/reports", label: "日報を確認する", icon: FileText, tone: "emerald" },
        { href: "/dispatch", label: "配員を組む", icon: Users, tone: "violet" },
        { href: "/sites/new", label: "現場を追加する", icon: HardHat, tone: "amber" },
        { href: "/calendar", label: "予定を追加する", icon: CalendarClock, tone: "sky" },
      ]
    : [
        { href: "/reports", label: "日報を書く", icon: FileText, tone: "emerald" },
        { href: "/calendar", label: "予定を確認する", icon: CalendarClock, tone: "sky" },
        { href: "/sites", label: "現場一覧", icon: HardHat, tone: "violet" },
      ];

  // ヒント（現場管理を使いこなすための実用的な案内。架空のお知らせは載せない）
  const tips = [
    "日報は「現場入り（出面）」から書き始められます",
    "カレンダーの予定は現場に紐づけて共有できます",
    "写真は作業・図面・工程などの種別で整理できます",
  ];

  return (
    <div>
      {/* ヘッダー（参考デザイン準拠：白基調＋角丸アイコン＋タイトル） */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md safe-top">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 md:px-8 md:py-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card md:h-12 md:w-12">
            <LayoutDashboard className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight text-ink md:text-2xl">ダッシュボード</h1>
            <p className="truncate text-xs text-ink-muted md:text-sm">
              {greeting()}、{user.name} さん ・ {fmtDateWithDay(dateFromKey(todayKey))}
            </p>
          </div>
          <div className="shrink-0 md:hidden">
            <AppMenu user={user} />
          </div>
        </div>
      </header>

      <PageContainer>
        <div className="space-y-5 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
          {/* ───────────── メイン（左・中央 2/3） ───────────── */}
          <div className="space-y-5 lg:col-span-2">
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
            </section>

            {/* 日報の到着状況（主役①） */}
            <section className="space-y-2.5">
              <SectionTitle
                action={
                  <Link href={admin ? "/dispatch" : "/reports"} className="text-xs font-semibold text-brand-600">
                    {admin ? "配員ボード" : "日報一覧"}
                  </Link>
                }
              >
                日報の到着状況
              </SectionTitle>

              {admin ? (
                <div className="card p-4 md:p-5">
                  <div className="flex items-center gap-3">
                    <IconBadge icon={FileText} tone="emerald" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink">本日の日報 提出状況</p>
                      <p className="text-xs text-ink-muted">{fmtDateWithDay(dateFromKey(todayKey))} 時点</p>
                    </div>
                    {dispatchSummary.going > 0 && (
                      dispatchSummary.pending > 0 ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          未提出 {dispatchSummary.pending}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          全員提出済み
                        </span>
                      )
                    )}
                  </div>

                  {dispatchSummary.going > 0 ? (
                    <>
                      <div className="mt-4 flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold tnum leading-none text-ink">{dispatchSummary.submitted}</span>
                        <span className="text-sm font-semibold text-ink-muted">/ {dispatchSummary.going} 名 提出</span>
                      </div>
                      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.round((dispatchSummary.submitted / dispatchSummary.going) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <MiniStat label="現場入り" value={dispatchSummary.going} tone="brand" />
                        <MiniStat label="提出済" value={dispatchSummary.submitted} tone="emerald" />
                        <MiniStat label="未提出" value={dispatchSummary.pending} tone="amber" />
                      </div>
                      {dispatchSummary.pending > 0 && (
                        <Link
                          href="/dispatch"
                          className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-surface-subtle py-2.5 text-sm font-bold text-brand-600 active:scale-[0.99]"
                        >
                          未提出の {dispatchSummary.pending} 名を配員ボードで確認
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                    </>
                  ) : (
                    <Link
                      href={`/dispatch?d=${todayKey}`}
                      className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-subtle px-4 py-3 text-sm text-ink-muted active:bg-surface-sunken"
                    >
                      <Users className="h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="flex-1">本日の配員はまだ組まれていません</span>
                      <span className="text-xs font-bold text-brand-600">配員ボードへ</span>
                    </Link>
                  )}
                </div>
              ) : visitSites.length > 0 ? (
                <div className="card overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <IconBadge icon={FileText} tone="emerald" size="sm" />
                    <p className="flex-1 text-sm font-bold text-ink">本日の日報</p>
                    <span className="text-xs font-semibold text-ink-muted tnum">
                      {mySubmittedCount}/{visitSites.length} 提出
                    </span>
                  </div>
                  <ul className="divide-y divide-line">
                    {visitSites.map((s) => {
                      const r = reportBySiteId.get(s.id);
                      const status = r?.status;
                      const tone = status === "SUBMITTED" ? "active" : status === "DRAFT" ? "warn" : "danger";
                      const label = status === "SUBMITTED" ? "提出済" : status === "DRAFT" ? "下書き" : "未打刻";
                      return (
                        <li key={s.id}>
                          <Link
                            href={staffReportHref(status, s.id, r?.id)}
                            className="flex items-center gap-3 px-4 py-3 active:bg-surface-subtle"
                          >
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                status === "SUBMITTED" ? "bg-emerald-500" : status === "DRAFT" ? "bg-amber-500" : "bg-red-500",
                              )}
                            />
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{s.name}</p>
                            <Badge tone={tone}>{label}</Badge>
                            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <Link
                  href="/reports"
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-4 active:bg-surface-subtle"
                >
                  <IconBadge icon={FileText} tone="slate" size="sm" />
                  <span className="flex-1 text-sm text-ink-muted">本日の現場入りはまだありません</span>
                  <span className="text-xs font-bold text-brand-600">日報から追加</span>
                </Link>
              )}
            </section>

            {/* カレンダーの状況（主役②）：今週ストリップ＋本日の予定 */}
            <section className="space-y-2.5">
              <SectionTitle action={<Link href="/calendar" className="text-xs font-semibold text-brand-600">カレンダー</Link>}>
                カレンダーの状況
              </SectionTitle>

              <div className="card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <IconBadge icon={CalendarDays} tone="sky" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">今週の予定</p>
                    <p className="text-xs text-ink-muted">
                      {fmtMonthDay(weekStart)} 〜 {fmtMonthDay(dateFromKey(weekDayKeys[6]))} ・ {weekEventCount}件
                    </p>
                  </div>
                </div>
                {/* 週ストリップ（各日：曜日・日付・出所色ドット・現場入り） */}
                <div className="grid grid-cols-7 gap-1">
                  {weekDayKeys.map((k) => {
                    const d = dateFromKey(k);
                    const dow = d.getDay();
                    const isToday = k === todayKey;
                    const sources = Array.from(new Set(weekSourcesByDay.get(k) ?? [])).slice(0, 3);
                    const hasVisit = weekVisitDays.has(k);
                    return (
                      <Link
                        key={k}
                        href={`/calendar?view=day&d=${k}`}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-xl py-2 transition-colors",
                          isToday ? "bg-brand-50" : "hover:bg-surface-subtle",
                        )}
                      >
                        <span className={cn(
                          "text-[11px] font-bold",
                          dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-ink-muted",
                        )}>
                          {WEEKDAYS[dow]}
                        </span>
                        <span className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tnum",
                          isToday ? "bg-brand-600 text-white" : "text-ink",
                        )}>
                          {d.getDate()}
                        </span>
                        <span className="flex h-3 items-center justify-center gap-0.5">
                          {hasVisit && <HardHat className="h-2.5 w-2.5 text-brand-600" aria-label="現場入り" />}
                          {sources.map((s, i) => (
                            <span
                              key={i}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: EVENT_SOURCE_COLOR[s as EventSource] ?? EVENT_SOURCE_COLOR.MANUAL }}
                            />
                          ))}
                        </span>
                      </Link>
                    );
                  })}
                </div>

                {/* 本日の予定 */}
                <div className="mt-3 border-t border-line pt-3">
                  <p className="mb-2 text-xs font-bold text-ink-muted">本日の予定</p>
                  {todayEvents.length === 0 ? (
                    <p className="rounded-xl bg-surface-subtle px-3 py-3 text-sm text-ink-muted">本日の予定はありません</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {todayEvents.map((e) => {
                        const color = EVENT_SOURCE_COLOR[e.source as EventSource];
                        const Icon = e.source === "DELIVERY" ? Truck : e.source === "SUPPLY" ? PackageCheck : CalendarClock;
                        return (
                          <li key={e.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1a`, color }}>
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
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* 統計タイル（現場・カレンダー中心） */}
            <section className="grid grid-cols-3 gap-2.5 lg:gap-4">
              <StatTile label="担当の進行中" value={activeSites.length} tone="brand" icon={HardHat} href="/sites?status=ACTIVE" />
              {admin ? (
                <StatTile label="現調中" value={surveyCount} tone="neutral" icon={ClipboardList} href="/sites?status=SURVEY" />
              ) : (
                <StatTile label="今週の予定" value={weekEventCount} tone="neutral" icon={CalendarDays} href="/calendar" />
              )}
              <StatTile label="本日の予定" value={todayEvents.length} tone="neutral" icon={CalendarClock} href="/calendar" />
            </section>

            {/* 明日の現場入り */}
            {(myTomorrowVisits.length > 0 || admin) && (
              <section className="space-y-2.5">
                <SectionTitle>明日の現場入り</SectionTitle>
                {myTomorrowVisits.length > 0 ? (
                  <div className="card divide-y divide-line">
                    {myTomorrowVisits.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                        <IconBadge icon={Sun} tone="amber" />
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

            {/* 担当現場 */}
            <section className="space-y-2.5">
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
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {activeSites.slice(0, 6).map((s) => (
                    <SiteCard key={s.id} site={s} />
                  ))}
                </div>
              )}
            </section>

            {admin && (
              <Link href="/customers" className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 active:bg-surface-subtle">
                <IconBadge icon={Building2} tone="brand" size="sm" />
                <span className="flex-1 text-sm font-semibold text-ink">顧客（元請企業）を管理</span>
                <ChevronRight className="h-4 w-4 text-ink-faint" />
              </Link>
            )}
          </div>

          {/* ───────────── 右レール（1/3・参考デザインのカラフルなカード） ───────────── */}
          <aside className="space-y-5 lg:sticky lg:top-24">
            {/* クイック操作 */}
            <section className="space-y-2.5">
              <SectionTitle>クイック操作</SectionTitle>
              <div className="card p-2">
                {quickActions.map((a) => (
                  <QuickAction key={a.href} {...a} />
                ))}
              </div>
            </section>

            {/* ヒント（グラデカード＋装飾モチーフ） */}
            <section className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <Lightbulb className="h-4 w-4 text-accent-500" aria-hidden />
                <h2 className="text-sm font-bold text-ink-soft">使い方のヒント</h2>
              </div>
              <div className="card overflow-hidden">
                <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-500 px-4 py-4 text-white">
                  <CardMotif />
                  <p className="relative text-sm font-bold">Mielba を使いこなそう</p>
                  <p className="relative mt-0.5 text-xs text-brand-100">現場管理をもっとスムーズに</p>
                </div>
                <ul className="divide-y divide-line">
                  {tips.map((t, i) => (
                    <li key={i} className="flex items-start gap-2.5 px-4 py-3">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                      <p className="text-sm font-medium leading-relaxed text-ink-soft">{t}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* サポート（グラデカード＋装飾モチーフ） */}
            <section className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <Megaphone className="h-4 w-4 text-emerald-500" aria-hidden />
                <h2 className="text-sm font-bold text-ink-soft">サポート</h2>
              </div>
              <div className="card overflow-hidden">
                <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-500 px-4 py-4 text-white">
                  <CardMotif />
                  <p className="relative text-sm font-bold">お困りですか？</p>
                  <p className="relative mt-0.5 text-xs text-emerald-50">設定やアカウントを確認できます</p>
                </div>
                <div className="p-2">
                  <QuickAction href="/settings" label="アプリの設定" icon={LifeBuoy} tone="emerald" />
                  <QuickAction href="/settings/account" label="アカウント・表示" icon={PenLine} tone="teal" />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </PageContainer>
    </div>
  );
}
