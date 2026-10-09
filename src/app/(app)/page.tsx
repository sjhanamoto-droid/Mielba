import Link from "next/link";
import {
  ArrowRight, Bell, BellRing, Building2, CalendarDays, ChevronRight, Ellipsis, MapPin,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { isSurveySite, surveyFormHref } from "@/lib/missing-reports";
import { jstDateKey, todayRange, tomorrowKey, dateFromKey, storedDateKey } from "@/lib/date";
import { PageContainer } from "@/components/app-shell/page-container";
import { OtherNotices, type NoticeItem } from "@/features/dashboard/other-notices";
import { RemindReportsButton } from "@/features/dashboard/remind-reports-button";
import { IconBadge } from "@/components/ui/icon-badge";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { cn, mapSearchUrl } from "@/lib/utils";
import {
  EVENT_SOURCE_LABEL, SITE_STATUS_LABEL, PROJECT_TYPE_LABEL,
  type EventSource, type SiteStatus, type ProjectType,
} from "@/lib/constants";
import { visibleEventWhere } from "@/lib/event-visibility";
import { dayTone, holidayName } from "@/lib/holidays";

// ホーム（スマホで毎朝開く画面）。情報に優先順位をつけ、上から順に
//   ① 今日の現場（一番大きく。引き継ぎと「現場の詳細を見る」）
//   ② 今日の日報（状態と次にやること1つ）
//   ③ これからの予定（行で軽く）
//   ④ その他の連絡事項（1行）
// の順に並べる。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "09:00" → "9:00" */
function shortTime(t: string): string {
  return t.replace(/^0(\d)/, "$1");
}

/** 予定の時間帯（「9:00–17:00」「9:00〜」「終日」）。時刻が無ければ null */
function timeRange(e: { allDay: boolean; startTime: string | null; endTime: string | null } | undefined): string | null {
  if (!e) return null;
  if (e.startTime && e.endTime) return `${shortTime(e.startTime)}–${shortTime(e.endTime)}`;
  if (e.startTime) return `${shortTime(e.startTime)}〜`;
  return e.allDay ? "終日" : null;
}

/** 住所から市区町村だけを取り出す（「東京都世田谷区…」→「世田谷区」） */
function areaOf(address: string | null): string | null {
  if (!address) return null;
  const rest = address.trim().replace(/^(東京都|北海道|京都府|大阪府|.{2,3}県)/, "");
  const m = rest.match(/^(.+?[市区町村郡])/);
  return m ? m[1] : null;
}

/** 日付の文字色：祝日・日曜＝赤、土曜＝青（予定画面と同じ）。平日は fallback */
function toneText(dateKey: string, dow: number, fallback: string): string {
  const tone = dayTone(dateKey, dow);
  return tone === "saturday" ? "text-blue-500" : tone ? "text-red-500" : fallback;
}

/** 見出し右の小さな導線（「予定を見る ›」など） */
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-sm font-semibold text-brand-600">
      {label}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  const admin = isAdmin(user);

  // 「今日」は日本時間の暦日で判定する
  const todayKey = jstDateKey();
  const today = todayRange(); // { gte, lt }
  const tmrwKey = tomorrowKey();
  const tomorrowStart = dateFromKey(tmrwKey);

  // ── 互いに独立したクエリは 1 波で並列取得する（本番 PostgreSQL は 1 クエリ = 1 往復） ──
  const emptyPairs: { siteId: string; userId: string }[] = [];
  const [
    todayVisits,
    myReportsToday,
    todayEvents,
    upcomingVisits,
    allVisitsToday,
    submittedToday,
    provisionalSites,
    unreadNotifications,
  ] = await Promise.all([
    // 今日の現場入り（出面）。日報・未提出はこれに連動
    db.siteVisit.findMany({
      where: { userId: user.id, date: today },
      include: {
        site: {
          select: {
            id: true, name: true, address: true, siteStatus: true,
            projectType: true, locationName: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    // 本日分の自分の日報（状態判定用）
    db.dailyReport.findMany({
      where: { userId: user.id, workDate: today },
      select: { id: true, siteId: true, status: true },
    }),
    // 本日の予定（現場の時間帯・作業名と、配達/支給品の連絡に使う）
    db.calendarEvent.findMany({
      where: visibleEventWhere(user.id, { date: today }),
      include: {
        site: { select: { id: true, name: true } },
        participants: { select: { userId: true } },
      },
      orderBy: [{ startTime: "asc" }],
    }),
    // 明日以降の自分の現場入り（「これからの予定」）。件数で切らず全部出す
    db.siteVisit.findMany({
      where: { userId: user.id, date: { gte: tomorrowStart } },
      include: { site: { select: { id: true, name: true, address: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    // 管理者向け：今日の全スタッフの現場入り（日報の到着状況用）
    admin
      ? db.siteVisit.findMany({ where: { date: today }, select: { siteId: true, userId: true } })
      : Promise.resolve(emptyPairs),
    // 管理者向け：今日の提出済み日報
    admin
      ? db.dailyReport.findMany({
          where: { status: "SUBMITTED", workDate: today },
          select: { siteId: true, userId: true },
        })
      : Promise.resolve(emptyPairs),
    // 仮登録（本登録に必要な項目が未入力）の現場。作成した本人にだけ知らせる
    db.site.findMany({
      where: { provisional: true, createdById: user.id },
      select: { id: true },
      take: 20,
    }),
    // 通知の未読数（ベルの印）
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  // ── 第2波：今日の現場ごとの担当者・引き継ぎ、これからの予定の時間帯 ──
  const visitSiteIds = Array.from(new Set(todayVisits.map((v) => v.siteId)));
  const upcomingSiteIds = Array.from(new Set(upcomingVisits.map((v) => v.siteId)));
  const lastUpcoming = upcomingVisits[upcomingVisits.length - 1]?.date;
  const [crewVisits, openHandovers, upcomingEvents, upcomingCrewVisits] = await Promise.all([
    visitSiteIds.length
      ? db.siteVisit.findMany({
          where: { siteId: { in: visitSiteIds }, date: today },
          select: {
            siteId: true,
            user: { select: { id: true, name: true, avatarColor: true, avatarImage: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    // 対応中の引き継ぎ（全員の画面に残るもの。確認はアプリ起動時のゲートと現場詳細で）
    visitSiteIds.length
      ? db.handover.findMany({
          where: { siteId: { in: visitSiteIds }, resolvedAt: null },
          // 古い順（申し送りの流れどおり）。自分が確認済みか・誰からかも出す
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            siteId: true,
            content: true,
            createdAt: true,
            createdById: true,
            reads: { where: { userId: user.id }, select: { userId: true } },
          },
        })
      : Promise.resolve([]),
    upcomingSiteIds.length && lastUpcoming
      ? db.calendarEvent.findMany({
          where: visibleEventWhere(user.id, {
            siteId: { in: upcomingSiteIds },
            date: { gte: tomorrowStart, lte: lastUpcoming },
          }),
          select: { siteId: true, date: true, allDay: true, startTime: true, endTime: true },
          orderBy: [{ startTime: "asc" }],
        })
      : Promise.resolve([]),
    // これからの予定：その日その現場に一緒に行く人（自分を含む全員）
    upcomingSiteIds.length && lastUpcoming
      ? db.siteVisit.findMany({
          where: { siteId: { in: upcomingSiteIds }, date: { gte: tomorrowStart, lte: lastUpcoming } },
          select: { siteId: true, date: true, user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const reportBySiteId = new Map(myReportsToday.map((r) => [r.siteId, r]));

  // 今日の担当：苗字が同じ人が多いので、名前ではなくアイコン（写真 or 色＋頭文字）で出す
  const crewBySite = new Map<string, { id: string; name: string; avatarColor: string; avatarImage: string | null }[]>();
  for (const v of crewVisits) {
    const list = crewBySite.get(v.siteId) ?? [];
    list.push(v.user);
    crewBySite.set(v.siteId, list);
  }
  // 引き継ぎ：未確認（自分が書いたものは確認不要）を先に、それぞれ古い順
  const handoverAuthorIds = Array.from(
    new Set(openHandovers.map((h) => h.createdById).filter((v): v is string => !!v)),
  );
  const handoverAuthors = handoverAuthorIds.length
    ? await db.user.findMany({ where: { id: { in: handoverAuthorIds } }, select: { id: true, name: true } })
    : [];
  const authorName = new Map(handoverAuthors.map((u) => [u.id, u.name]));
  const handoversBySite = new Map<string, HomeHandover[]>();
  for (const h of openHandovers) {
    const list = handoversBySite.get(h.siteId) ?? [];
    list.push({
      id: h.id,
      content: h.content,
      createdAt: h.createdAt,
      authorName: h.createdById ? authorName.get(h.createdById) : undefined,
      unread: h.createdById !== user.id && h.reads.length === 0,
    });
    handoversBySite.set(h.siteId, list);
  }
  for (const list of handoversBySite.values()) {
    list.sort((a, b) => Number(b.unread) - Number(a.unread));
  }
  // 現場の予定（今日）：時間帯と作業名に使う。自分が参加者のものを優先する
  function siteEventToday(siteId: string) {
    const events = todayEvents.filter((e) => e.siteId === siteId && e.source === "MANUAL");
    return events.find((e) => e.participants.some((p) => p.userId === user.id)) ?? events[0];
  }
  function crewOn(siteId: string, date: Date): string[] {
    const key = storedDateKey(date);
    return upcomingCrewVisits
      .filter((v) => v.siteId === siteId && storedDateKey(v.date) === key)
      .map((v) => v.user.name);
  }
  function siteEventOn(siteId: string, date: Date) {
    const key = storedDateKey(date);
    return upcomingEvents.find((e) => e.siteId === siteId && storedDateKey(e.date) === key);
  }

  // 日報の帯：今日の現場のうち、まだ提出していない最初の現場を対象にする
  const target =
    todayVisits.find((v) => reportBySiteId.get(v.siteId)?.status !== "SUBMITTED") ?? todayVisits[0];
  const submittedCount = todayVisits.filter(
    (v) => reportBySiteId.get(v.siteId)?.status === "SUBMITTED",
  ).length;
  const allSubmitted = todayVisits.length > 0 && submittedCount === todayVisits.length;
  const targetReport = target ? reportBySiteId.get(target.siteId) : undefined;
  const reportAction = !target
    ? null
    : allSubmitted
      ? { href: targetReport ? `/reports/${targetReport.id}` : "/reports", label: "日報を見る" }
      : targetReport?.status === "DRAFT"
        ? { href: `/reports/${targetReport.id}/edit`, label: "続きを書く" }
        : isSurveySite(target.site.siteStatus)
          ? { href: surveyFormHref(target.siteId), label: "現調を書く" }
          : { href: `/reports/new?siteId=${target.siteId}`, label: "日報を書く" };

  // 管理者向け：今日の日報の到着状況
  const subSet = new Set(submittedToday.map((r) => `${r.siteId}_${r.userId}`));
  const dispatch = {
    going: allVisitsToday.length,
    submitted: allVisitsToday.filter((v) => subSet.has(`${v.siteId}_${v.userId}`)).length,
  };
  const dispatchPending = dispatch.going - dispatch.submitted;

  // その他の連絡事項：本日の配達・支給品
  const notices: NoticeItem[] = todayEvents
    .filter((e) => e.source === "DELIVERY" || e.source === "SUPPLY")
    .map((e) => ({
      key: `event-${e.id}`,
      title: `${EVENT_SOURCE_LABEL[e.source as EventSource]}：${e.title}`,
      desc: [e.site?.name, timeRange(e)].filter(Boolean).join(" ・ ") || undefined,
      href: e.site ? `/sites/${e.site.id}` : `/calendar?view=day&d=${todayKey}`,
    }));

  const todayDate = dateFromKey(todayKey);
  const todayHoliday = holidayName(todayKey);
  const outlineBtn = "shrink-0 border-brand-200 text-brand-700 dark:border-brand-800";

  return (
    <div>
      {/* スマホはヘッダー非表示のため、ノッチ回避の上余白のみ確保 */}
      <div aria-hidden className="safe-top" />
      <PageContainer size="narrow">
        <div className="space-y-5">
          {/* ── ヘッダー：日付・通知・メニュー ── */}
          <div className="flex items-center gap-2">
            <Link
              href={`/calendar?view=day&d=${todayKey}`}
              className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface py-2.5 pl-3.5 pr-5 shadow-card active:bg-surface-subtle"
            >
              <CalendarDays className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <span className={cn("text-xl font-bold tnum", toneText(todayKey, todayDate.getDay(), "text-ink"))}>
                {todayDate.getMonth() + 1}月{todayDate.getDate()}日
              </span>
              <span className={cn("text-sm font-semibold", toneText(todayKey, todayDate.getDay(), "text-ink-muted"))}>
                {WEEKDAYS[todayDate.getDay()]}曜日
              </span>
              {todayHoliday && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  {todayHoliday}
                </span>
              )}
            </Link>
            <Link
              href="/notifications"
              aria-label={unreadNotifications > 0 ? `通知（未読 ${unreadNotifications} 件）` : "通知"}
              className="relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-ink-soft shadow-card active:bg-surface-subtle"
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
            <Link
              href="/menu"
              aria-label="メニュー"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-ink-soft shadow-card active:bg-surface-subtle"
            >
              <Ellipsis className="h-5 w-5" />
            </Link>
          </div>

          {/* ── ① 今日の現場（一番大きく） ── */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold text-ink">今日の現場</h2>
              <SectionLink href={`/calendar?view=day&d=${todayKey}`} label="予定を見る" />
            </div>

            {todayVisits.length === 0 ? (
              <div className="card px-4 py-6">
                <p className="text-[15px] text-ink-muted">今日の現場の予定はありません</p>
              </div>
            ) : (
              todayVisits.map((v) => {
                const ev = siteEventToday(v.siteId);
                const time = timeRange(ev);
                const area = areaOf(v.site.address);
                const crew = crewBySite.get(v.siteId) ?? [];
                const handovers = handoversBySite.get(v.siteId) ?? [];
                // 作業名：今日の予定の件名 → 作業場所 → 工事種別
                const work =
                  (ev?.title && ev.title !== v.site.name ? ev.title : null) ??
                  v.site.locationName ??
                  PROJECT_TYPE_LABEL[v.site.projectType as ProjectType];
                return (
                  <div key={v.id} className="card p-5">
                    {/* 時間帯と状態 */}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-base tnum text-ink-muted">{time ? time.replace("–", " — ") : " "}</p>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden />
                        {SITE_STATUS_LABEL[v.site.siteStatus as SiteStatus] ?? v.site.siteStatus}
                      </span>
                    </div>
                    <h3 className="mt-3 break-words text-2xl font-bold leading-snug text-ink [text-wrap:pretty]">
                      {v.site.name}
                    </h3>
                    {work && <p className="mt-2 text-sm text-ink-muted">{work}</p>}

                    {/* 引き継ぎ（未確認があれば赤で強く促す） */}
                    {handovers.length > 0 && <HomeHandoverBlock siteId={v.siteId} items={handovers} />}

                    {(area || crew.length > 0) && (
                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                        {area && v.site.address && (
                          <a
                            href={mapSearchUrl(v.site.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-w-0 items-center gap-1.5 font-medium text-brand-600"
                          >
                            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                            <span>{area}</span>
                          </a>
                        )}
                        {crew.length > 0 && (
                          <span
                            className="flex min-w-0 items-center gap-2"
                            aria-label={`担当 ${crew.map((p) => p.name).join("・")}`}
                          >
                            <span aria-hidden>担当</span>
                            <span className="flex flex-wrap items-center gap-1" aria-hidden>
                              {crew.map((p) => (
                                <span key={p.id} title={p.name}>
                                  <Avatar name={p.name} color={p.avatarColor} image={p.avatarImage} size="sm" />
                                </span>
                              ))}
                            </span>
                          </span>
                        )}
                      </div>
                    )}

                    <LinkButton href={`/sites/${v.siteId}`} size="lg" className="mt-4 w-full">
                      現場の詳細を見る
                      <ArrowRight className="h-5 w-5" aria-hidden />
                    </LinkButton>
                  </div>
                );
              })
            )}
          </section>

          {/* ── ② 今日の日報 ── */}
          {target && reportAction && (
            <section className="flex items-center gap-3 border-b border-line px-1 pb-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col items-start gap-1.5">
                  <h2 className="text-base font-bold text-ink">今日の日報</h2>
                  {allSubmitted ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      提出済み
                    </span>
                  ) : targetReport?.status === "DRAFT" ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                      下書き
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                      未提出
                    </span>
                  )}
                </div>
                {/* 現場が複数ある日だけ、どの現場の日報か・何件出したかを添える */}
                {!allSubmitted && todayVisits.length > 1 && (
                  <p className="mt-1 text-sm text-ink-muted">
                    {target.site.name}（{submittedCount}/{todayVisits.length} 提出）
                  </p>
                )}
              </div>
              <Link
                href={reportAction.href}
                className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700 active:opacity-70 dark:text-brand-300"
              >
                {reportAction.label}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </section>
          )}

          {/* 管理者：全体の日報の到着状況 */}
          {admin && (
            <section className="card p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h2 className="text-lg font-bold text-ink">日報の到着</h2>
                    {dispatch.going > 0 &&
                      (dispatchPending > 0 ? (
                        <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                          未提出 {dispatchPending}名
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          全員提出
                        </span>
                      ))}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {dispatch.going > 0
                      ? `提出 ${dispatch.submitted} / ${dispatch.going} 名`
                      : "本日の配員はまだ組まれていません"}
                  </p>
                </div>
                <LinkButton href={`/dispatch?d=${todayKey}`} variant="outline" className={outlineBtn}>
                  {dispatch.going > 0 ? "状況を見る" : "配員する"}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </LinkButton>
              </div>
              {dispatch.going > 0 && (
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round((dispatch.submitted / dispatch.going) * 100)}%` }}
                  />
                </div>
              )}
              {dispatchPending > 0 && <RemindReportsButton pendingCount={dispatchPending} />}
            </section>
          )}

          {/* ── ③ これからの予定 ── */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold text-ink">これからの予定</h2>
              <SectionLink href="/calendar" label="すべて見る" />
            </div>
            {upcomingVisits.length === 0 ? (
              <div className="card px-4 py-5">
                <p className="text-sm text-ink-muted">これからの現場の予定はありません</p>
              </div>
            ) : (
              <ul className="card divide-y divide-line overflow-hidden">
                {upcomingVisits.map((v) => {
                  const key = storedDateKey(v.date);
                  const d = dateFromKey(key);
                  const time = timeRange(siteEventOn(v.siteId, v.date));
                  const area = areaOf(v.site.address);
                  const holiday = holidayName(key);
                  const crew = crewOn(v.siteId, v.date);
                  return (
                    <li key={v.id}>
                      <Link
                        href={`/sites/${v.siteId}`}
                        className="flex items-center gap-4 px-4 py-3.5 tap-row"
                      >
                        <div className="w-11 shrink-0 text-center">
                          <p className={cn("text-xs font-bold", toneText(key, d.getDay(), "text-brand-600"))}>
                            {key === tmrwKey ? "明日" : WEEKDAYS[d.getDay()]}
                          </p>
                          <p className={cn("text-lg font-bold tnum", toneText(key, d.getDay(), "text-ink"))}>
                            {d.getMonth() + 1}/{d.getDate()}
                          </p>
                        </div>
                        <span className="h-10 w-px shrink-0 bg-line" aria-hidden />
                        <div className="min-w-0 flex-1">
                          {/* 省略せず全部出す：現場名・時間・場所・行く人 */}
                          <p className="break-words text-base font-bold text-ink">{v.site.name}</p>
                          {(holiday || time || area) && (
                            <p className="mt-0.5 break-words text-sm text-ink-muted tnum">
                              {holiday && (
                                <span className="font-bold text-red-500">
                                  {holiday}
                                  {(time || area) && " ・ "}
                                </span>
                              )}
                              {[time, area].filter(Boolean).join(" ・ ")}
                            </p>
                          )}
                          {crew.length > 0 && (
                            <p className="mt-0.5 break-words text-sm text-ink-soft">行く人 {crew.join("・")}</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── ④ その他の連絡事項 ── */}
          <OtherNotices todayKey={todayKey} items={notices} />

          {/* 仮登録の現場（作成した本人にだけ） */}
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

type HomeHandover = {
  id: string;
  content: string;
  createdAt: Date;
  authorName?: string;
  unread: boolean;
};

// 今日の現場カードの引き継ぎ。未確認があれば赤い枠で「入る前に必ず確認」を強く促す。
// 全部確認済みなら控えめに件数と「見る」導線だけ出す。
function HomeHandoverBlock({ siteId, items }: { siteId: string; items: HomeHandover[] }) {
  const unread = items.filter((h) => h.unread).length;
  const href = `/sites/${siteId}#handover`;
  if (unread === 0) {
    return (
      <Link
        href={href}
        className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-subtle px-5 py-4 active:opacity-80"
      >
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">この現場の</p>
          <p className="mt-0.5 text-base font-bold text-ink">
            引き継ぎ {items.length}件<span className="ml-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">確認済み</span>
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-soft">
          見る
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    );
  }
  return (
    <div className="mt-5 rounded-2xl border border-red-200 border-t-4 border-t-red-500 bg-red-50/70 px-5 pb-5 pt-4 dark:border-red-900/60 dark:border-t-red-500 dark:bg-red-950/30">
      <p className="text-xs text-ink-muted">この現場の</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-2xl font-bold text-red-600 dark:text-red-400">未確認の引き継ぎ</p>
        <p className="shrink-0 leading-none text-red-600 dark:text-red-400">
          <span className="text-4xl font-bold tnum">{unread}</span>
          <span className="ml-1 text-sm">件</span>
        </p>
      </div>
      <p className="mt-3 text-sm text-ink-soft">この現場に入る前に、必ず確認してください。</p>
      <Link
        href={href}
        className="mt-4 flex min-h-[56px] items-center justify-between gap-3 rounded-xl bg-red-500 px-5 text-base font-bold text-white transition hover:bg-red-600 active:opacity-90"
      >
        引き継ぎを確認する
        <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}
