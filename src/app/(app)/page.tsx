import Link from "next/link";
import {
  FileText, ChevronRight, HardHat, MapPin, Users, Truck, PackageCheck,
  CalendarClock, LayoutDashboard, Bell, BellRing, Building2,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { jstDateKey, todayRange, tomorrowKey, dayRangeForKey, dateFromKey, addDaysKey } from "@/lib/date";
import { PageContainer } from "@/components/app-shell/page-container";
import { mapSearchUrl } from "@/lib/utils";
import { ImportantAlerts, type AlertItem } from "@/features/dashboard/important-alerts";
import { RemindReportsButton } from "@/features/dashboard/remind-reports-button";
import { IconBadge } from "@/components/ui/icon-badge";
import { SectionTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { cn, fmtDateWithDay, fmtMonthDay } from "@/lib/utils";
import {
  EVENT_SOURCE_LABEL, EVENT_SOURCE_COLOR, SITE_STAGES, siteStageIndex,
  SITE_STATUS_LABEL, isPreOrderSite,
  type EventSource, type SiteStatus,
} from "@/lib/constants";
import { visibleEventWhere } from "@/lib/event-visibility";

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

/** 「9月8日（火）」形式（ホーム見出しの日付） */
function fmtHeaderDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

/** 「河西 茂樹」→「河西」。呼びかけは姓だけの方が画面が締まる */
function familyName(name: string): string {
  return name.trim().split(/[\s　]+/)[0] || name;
}

/** 見出し右の小さな導線（「配員を見る ›」など） */
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-semibold text-brand-600">
      {label}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
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
    todayVisits,
    myReportsToday,
    todayEvents,
    weekEvents,
    myTomorrowVisits,
    allVisitsToday,
    submittedToday,
    tomorrowGoingCount,
    provisionalSites,
    unreadNotifications,
  ] = await Promise.all([
    // 今日の現場入り（出面）。日報・未提出はこれに連動（配属ではなく「当日行く現場」）。
    db.siteVisit.findMany({
      where: { userId: user.id, date: today },
      include: {
        site: {
          select: { id: true, name: true, address: true, siteStatus: true, projectStatus: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    // 本日分の自分の日報（状態判定用）— ステータス込みで取得
    db.dailyReport.findMany({
      where: { userId: user.id, workDate: today },
      select: { id: true, siteId: true, status: true },
    }),
    // 本日の予定。表示は自分の予定のみに絞るため参加者も取得する
    // （配達/支給品の連絡は現場単位の情報なので全件のまま使う）
    db.calendarEvent.findMany({
      // 非公開の個人予定（最高管理者）は本人以外に出さない
      where: visibleEventWhere(user.id, { date: today }),
      include: {
        site: { select: { id: true, name: true } },
        participants: { select: { userId: true } },
      },
      orderBy: [{ startTime: "asc" }],
    }),
    // 今週の予定（週ストリップの出所色ドット用・全員が全現場分）
    db.calendarEvent.findMany({
      where: visibleEventWhere(user.id, { date: { gte: weekStart, lt: weekEnd } }),
      select: { id: true, date: true, source: true },
    }),
    // 明日の現場入り（自分の分）
    db.siteVisit.findMany({
      where: { userId: user.id, date: tomorrow },
      include: { site: { select: { id: true, name: true, address: true } } },
      orderBy: { createdAt: "asc" },
    }),
    // 管理者向け：今日の全スタッフの現場入り（日報の到着状況用）
    admin
      ? db.siteVisit.findMany({
          where: { date: today },
          select: { siteId: true, userId: true },
        })
      : Promise.resolve(emptyPairs),
    // 管理者向け：今日の提出済み日報
    admin
      ? db.dailyReport.findMany({
          where: { status: "SUBMITTED", workDate: today },
          select: { siteId: true, userId: true },
        })
      : Promise.resolve(emptyPairs),
    // 管理者向け：明日の全体現場入り件数
    admin ? db.siteVisit.count({ where: { date: tomorrow } }) : Promise.resolve(0),
    // 仮登録（本登録に必要な項目が未入力）の現場。作成した本人にだけ知らせる
    db.site.findMany({
      where: { provisional: true, createdById: user.id },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    // 通知の未読数（ホームヘッダのベルに赤バッジで表示）
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  const reportBySiteId = new Map(myReportsToday.map((r) => [r.siteId, r]));
  const visitSites = todayVisits.map((v) => ({ id: v.siteId, name: v.site.name }));
  // スタッフの日報到着状況（自分の当日提出状況）
  const mySubmittedCount = visitSites.filter(
    (s) => reportBySiteId.get(s.id)?.status === "SUBMITTED",
  ).length;

  // 本日の配達(DELIVERY)/支給品(SUPPLY)は「最初に確認」に載せる連絡
  const deliveryEvents = todayEvents.filter(
    (e) => e.source === "DELIVERY" || e.source === "SUPPLY",
  );

  // 「今週の予定」の下段に出す本日の予定はログイン本人のものだけ
  // （自分が所有者の個人予定＝休み等、または自分が参加者の現場予定）
  const myTodayEvents = todayEvents.filter(
    (e) => e.ownerId === user.id || e.participants.some((p) => p.userId === user.id),
  );

  // 週ストリップの集計（取得済みデータから組み立てる）
  const weekSourcesByDay = new Map<string, string[]>();
  for (const e of weekEvents) {
    const k = jstDateKey(e.date);
    const arr = weekSourcesByDay.get(k);
    if (arr) arr.push(e.source);
    else weekSourcesByDay.set(k, [e.source]);
  }

  // 管理者向け：今日の日報の到着状況（全スタッフの現場入りと提出状況）
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
  let openHandovers: {
    id: string; content: string; siteId: string; siteName: string; createdByName?: string;
  }[] = [];
  if (visitSiteIds.length > 0) {
    const handovers = await db.handover.findMany({
      where: { siteId: { in: visitSiteIds }, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, content: true, siteId: true, createdById: true,
        site: { select: { name: true } },
      },
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
      content: h.content,
      siteId: h.siteId,
      siteName: h.site.name,
      createdByName: h.createdById ? nameById.get(h.createdById) : undefined,
    }));
  }

  // ── 「最初に確認」に載せる連絡（現場に出る前に必ず目を通すものだけ） ──
  // 日報の入力は下の現場カードのボタンに導線があるため、ここには入れない。
  const alertItems: AlertItem[] = [
    ...openHandovers.map((h) => ({
      key: `handover-${h.id}`,
      siteName: h.siteName,
      title: h.content,
      desc: h.createdByName
        ? `${h.createdByName}さんからの引き継ぎがあります`
        : "前の担当者からの引き継ぎがあります",
      // 現場詳細の最上部に引き継ぎ事項（確認して停止つき）がある
      href: `/sites/${h.siteId}`,
    })),
    ...deliveryEvents.map((e) => ({
      key: `event-${e.id}`,
      siteName: e.site?.name,
      title: `本日 ${EVENT_SOURCE_LABEL[e.source as EventSource]}：${e.title}`,
      desc: e.allDay ? "終日の予定です" : e.startTime ? `${e.startTime} 予定` : undefined,
      href: e.site ? `/sites/${e.site.id}` : `/calendar?view=day&d=${todayKey}`,
    })),
  ];

  // 現場カードの日報ボタン（状態で文言と遷移先が変わる）
  function reportLink(siteId: string): { href: string; label: string } {
    const r = reportBySiteId.get(siteId);
    if (r?.status === "SUBMITTED") return { href: `/reports/${r.id}`, label: "日報を見る" };
    if (r?.status === "DRAFT") return { href: `/reports/${r.id}/edit`, label: "下書きを開く" };
    return { href: `/reports/new?siteId=${siteId}`, label: "日報を書く" };
  }

  const todayDate = dateFromKey(todayKey);
  const outlineBtn = "border-brand-200 text-brand-700 dark:border-brand-800";

  return (
    <div>
      {/* スマホはヘッダー非表示のため、ノッチ回避の上余白のみ確保 */}
      <div aria-hidden className="safe-top md:hidden" />
      {/* 上部ヘッダーはスマホでは非表示（メニューはボトムナビへ移設）。PC/タブレットのみ表示 */}
      <header className="sticky top-0 z-30 hidden border-b border-line bg-surface/90 backdrop-blur-md safe-top md:block">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 md:px-8 md:py-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card md:h-12 md:w-12">
            <LayoutDashboard className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight text-ink md:text-2xl">ホーム</h1>
            <p className="truncate text-xs text-ink-muted md:text-sm">
              {greeting()}、{user.name} さん ・ {fmtDateWithDay(todayDate)}
            </p>
          </div>
        </div>
      </header>

      <PageContainer>
        <div className="space-y-5">
          {/* ホーム見出し（スマホ）：左に「ホーム」＋日付、右に名前と通知ベル */}
          <div className="flex items-start justify-between gap-3 md:hidden">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight text-ink">ホーム</h1>
              <p className="mt-0.5 text-sm text-ink-muted">{fmtHeaderDate(todayDate)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold text-ink-soft">
                {familyName(user.name)}さん
              </span>
              <Link
                href="/notifications"
                aria-label={unreadNotifications > 0 ? `通知（未読 ${unreadNotifications} 件）` : "通知"}
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-ink-soft shadow-card active:bg-surface-subtle"
              >
                {unreadNotifications > 0 ? (
                  <BellRing className="h-5 w-5 text-brand-600" />
                ) : (
                  <Bell className="h-5 w-5" />
                )}
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1 text-[11px] font-bold text-white">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* ① 最初に確認（引き継ぎ・当日の配達などの連絡を集約） */}
          <ImportantAlerts todayKey={todayKey} items={alertItems} />

          {/* ② 今日・明日の現場（縦並び。今日を上に大きく） */}
          <section className="space-y-2.5">
            <SectionTitle action={<SectionLink href="/dispatch" label="配員を見る" />}>
              今日・明日の現場
            </SectionTitle>

            <div className="card overflow-hidden">
              {/* 今日 */}
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
                    今日
                  </span>
                  <span className="text-sm font-semibold text-ink-muted">
                    {fmtMonthDay(todayDate)}
                  </span>
                  {todayVisits.length > 0 && (
                    <span className="ml-auto text-sm font-bold tnum text-ink-muted">
                      {todayVisits.length}件
                    </span>
                  )}
                </div>

                {todayVisits.length === 0 ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-ink-muted">現場の予定はありません</p>
                    <SectionLink href={`/calendar?view=day&d=${todayKey}`} label="予定を確認する" />
                  </div>
                ) : (
                  <div className="mt-3 space-y-5">
                    {todayVisits.map((v) => {
                      // 現調・見送りは工程が始まっていないので、工程名ではなく区分を出す
                      const stage = isPreOrderSite(v.site.siteStatus)
                        ? SITE_STATUS_LABEL[v.site.siteStatus as SiteStatus]
                        : SITE_STAGES[siteStageIndex(v.site.siteStatus, v.site.projectStatus)];
                      const report = reportLink(v.siteId);
                      return (
                        <div key={v.id}>
                          <Link
                            href={`/sites/${v.siteId}`}
                            className="block text-lg font-bold leading-snug text-ink"
                          >
                            {v.site.name}
                          </Link>
                          {v.site.address && (
                            <a
                              href={mapSearchUrl(v.site.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 flex items-center gap-1 text-sm font-medium text-brand-600"
                            >
                              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                              <span className="min-w-0 truncate">{v.site.address}</span>
                            </a>
                          )}
                          <span className="mt-2 inline-flex rounded-lg bg-surface-sunken px-2.5 py-1 text-xs font-bold text-ink-soft">
                            {stage}
                          </span>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <LinkButton
                              href={`/sites/${v.siteId}`}
                              variant="outline"
                              className={outlineBtn}
                            >
                              <HardHat className="h-[18px] w-[18px]" aria-hidden />
                              現場詳細
                            </LinkButton>
                            <LinkButton href={report.href} variant="outline" className={outlineBtn}>
                              <FileText className="h-[18px] w-[18px]" aria-hidden />
                              {report.label}
                            </LinkButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 明日 */}
              <div className="border-t border-line p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-bold text-ink-soft">
                    明日
                  </span>
                  <span className="text-sm font-semibold text-ink-muted">
                    {fmtMonthDay(dateFromKey(tmrwKey))}
                  </span>
                  {myTomorrowVisits.length > 0 && (
                    <span className="ml-auto text-sm font-bold tnum text-ink-muted">
                      {myTomorrowVisits.length}件
                    </span>
                  )}
                </div>

                {myTomorrowVisits.length > 0 ? (
                  <ul className="mt-3 space-y-2.5">
                    {myTomorrowVisits.map((v) => (
                      <li key={v.id}>
                        <Link
                          href={`/sites/${v.site.id}`}
                          className="flex items-center gap-2 active:opacity-70"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-bold text-ink">{v.site.name}</p>
                            {v.site.address && (
                              <p className="truncate text-xs text-ink-muted">{v.site.address}</p>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-ink-muted">
                      {admin && tomorrowGoingCount > 0
                        ? `自分の予定はありません（全体で${tomorrowGoingCount}名）`
                        : "現場の予定はありません"}
                    </p>
                    <SectionLink
                      href={admin ? `/dispatch?d=${tmrwKey}` : `/calendar?view=day&d=${tmrwKey}`}
                      label="予定を確認する"
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ③ 日報の到着状況（提出数と未提出者だけに絞る） */}
          <section className="space-y-2.5">
            <SectionTitle
              action={<SectionLink href={admin ? "/dispatch" : "/reports"} label="一覧を見る" />}
            >
              日報の到着状況
            </SectionTitle>

            {admin ? (
              <div className="card p-4">
                {dispatchSummary.going > 0 ? (
                  <>
                    <div className="flex items-center gap-3">
                      <IconBadge icon={FileText} tone="emerald" />
                      <p className="flex-1 text-base font-bold text-ink">今日の提出</p>
                      <p className="shrink-0 text-ink-muted">
                        <span className="text-3xl font-bold tnum leading-none text-brand-700">
                          {dispatchSummary.submitted}
                        </span>
                        <span className="text-sm font-semibold"> / {dispatchSummary.going} 名</span>
                      </p>
                    </div>
                    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all"
                        style={{
                          width: `${Math.round((dispatchSummary.submitted / dispatchSummary.going) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      {dispatchSummary.pending > 0 ? (
                        <p className="flex items-center gap-1.5 text-sm font-bold text-amber-600 dark:text-amber-400">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                          未提出 {dispatchSummary.pending}名
                        </p>
                      ) : (
                        <p className="text-sm font-bold text-brand-700">全員提出済み</p>
                      )}
                      {dispatchSummary.pending > 0 && (
                        <LinkButton
                          href={`/dispatch?d=${todayKey}`}
                          variant="outline"
                          size="sm"
                          className={outlineBtn}
                        >
                          未提出者を確認
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </LinkButton>
                      )}
                    </div>
                    {dispatchSummary.pending > 0 && (
                      <RemindReportsButton pendingCount={dispatchSummary.pending} />
                    )}
                  </>
                ) : (
                  <Link
                    href={`/dispatch?d=${todayKey}`}
                    className="flex items-center gap-3 active:opacity-70"
                  >
                    <IconBadge icon={Users} tone="slate" />
                    <span className="flex-1 text-sm text-ink-muted">
                      本日の配員はまだ組まれていません
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  </Link>
                )}
              </div>
            ) : visitSites.length > 0 ? (
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <IconBadge icon={FileText} tone="emerald" />
                  <p className="flex-1 text-base font-bold text-ink">今日の提出</p>
                  <p className="shrink-0 text-ink-muted">
                    <span className="text-3xl font-bold tnum leading-none text-brand-700">
                      {mySubmittedCount}
                    </span>
                    <span className="text-sm font-semibold"> / {visitSites.length} 件</span>
                  </p>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round((mySubmittedCount / visitSites.length) * 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  {mySubmittedCount < visitSites.length ? (
                    <p className="flex items-center gap-1.5 text-sm font-bold text-amber-600 dark:text-amber-400">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                      未提出 {visitSites.length - mySubmittedCount}件
                    </p>
                  ) : (
                    <p className="text-sm font-bold text-brand-700">本日ぶんは提出済み</p>
                  )}
                  <SectionLink href="/reports" label="日報を確認" />
                </div>
              </div>
            ) : (
              <Link
                href="/reports"
                className="card flex items-center gap-3 px-4 py-4 active:bg-surface-subtle"
              >
                <IconBadge icon={FileText} tone="slate" />
                <span className="flex-1 text-sm text-ink-muted">本日の現場入りはありません</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              </Link>
            )}
          </section>

          {/* ④ 今週の予定（週ストリップ＋本日の予定。詳細はカレンダーへ） */}
          <section className="space-y-2.5">
            <SectionTitle action={<SectionLink href="/calendar?view=month" label="月表示" />}>
              今週の予定
            </SectionTitle>

            <div className="card p-4">
              <div className="grid grid-cols-7 gap-1">
                {weekDayKeys.map((k) => {
                  const d = dateFromKey(k);
                  const dow = d.getDay();
                  const isToday = k === todayKey;
                  const hasEvent = (weekSourcesByDay.get(k)?.length ?? 0) > 0;
                  return (
                    <Link
                      key={k}
                      href={`/calendar?view=day&d=${k}`}
                      className="flex flex-col items-center gap-1.5 rounded-xl py-1 active:bg-surface-subtle"
                    >
                      <span
                        className={cn(
                          "text-xs font-bold",
                          dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-ink-muted",
                        )}
                      >
                        {WEEKDAYS[dow]}
                      </span>
                      <span
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold tnum",
                          isToday ? "bg-brand-600 text-white" : "text-ink",
                        )}
                      >
                        {d.getDate()}
                      </span>
                      <span className="flex h-1.5 items-center justify-center">
                        {hasEvent && (
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isToday ? "bg-brand-500" : "bg-blue-500",
                            )}
                          />
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {/* 本日の予定（自分のぶんだけ。詳細はカレンダーで見る） */}
              <div className="mt-3 border-t border-line pt-3">
                {myTodayEvents.length === 0 ? (
                  <p className="text-sm text-ink-muted">本日の予定はありません</p>
                ) : (
                  <ul className="space-y-2">
                    {myTodayEvents.slice(0, 3).map((e) => {
                      const color = EVENT_SOURCE_COLOR[e.source as EventSource];
                      const Icon =
                        e.source === "DELIVERY" ? Truck : e.source === "SUPPLY" ? PackageCheck : CalendarClock;
                      return (
                        <li key={e.id} className="flex items-center gap-3">
                          <span
                            className="shrink-0 text-sm font-bold tnum text-brand-700"
                            style={{ minWidth: "5.5rem" }}
                          >
                            本日 {e.allDay ? "終日" : (e.startTime ?? "—")}
                          </span>
                          <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
                          <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                            {e.title}
                          </p>
                        </li>
                      );
                    })}
                    {myTodayEvents.length > 3 && (
                      <li className="pt-0.5">
                        <SectionLink
                          href={`/calendar?view=day&d=${todayKey}`}
                          label={`ほか${myTodayEvents.length - 3}件を見る`}
                        />
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* ⑤ 仮登録の現場（本登録に必要な項目が未入力） */}
          {provisionalSites.length > 0 && (
            <Link
              href={provisionalSites.length === 1 ? `/sites/${provisionalSites[0].id}` : "/sites"}
              className="card flex items-center gap-3 px-4 py-3.5 active:bg-surface-subtle"
            >
              <IconBadge icon={Building2} tone="brand" />
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                現場の登録内容を確認
              </span>
              <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-bold tnum text-ink-soft">
                {provisionalSites.length}件
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            </Link>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
