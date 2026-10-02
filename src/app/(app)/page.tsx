import Link from "next/link";
import {
  Bell, Building2, CalendarDays, ChevronRight, Ellipsis, FileText, MapPin, Users,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { isSurveySite, surveyFormHref } from "@/lib/missing-reports";
import { jstDateKey, todayRange, tomorrowKey, dateFromKey, storedDateKey } from "@/lib/date";
import { PageContainer } from "@/components/app-shell/page-container";
import { OtherNotices, type NoticeItem } from "@/features/dashboard/other-notices";
import { RemindReportsButton } from "@/features/dashboard/remind-reports-button";
import { cn } from "@/lib/utils";
import {
  EVENT_SOURCE_LABEL, SITE_STATUS_LABEL, PROJECT_TYPE_LABEL,
  type EventSource, type SiteStatus, type ProjectType,
} from "@/lib/constants";
import { visibleEventWhere } from "@/lib/event-visibility";

// ホーム（スマホで毎朝開く画面）。情報に優先順位をつけ、上から順に
//   ① 今日の現場（一番大きく。引き継ぎと「現場の詳細を見る」）
//   ② 今日の日報（帯で区切って次にやること）
//   ③ これからの予定（行で軽く）
//   ④ その他の連絡事項（1行）
// の順に並べる。

// 参考デザインの落ち着いた深緑と、うすい緑の面（ホーム専用。ダークモードはブランドトークン）
const DEEP = "text-[#245f4b] dark:text-brand-700";
const TINT = "bg-[#eef4ef] dark:bg-brand-100";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 「河西 茂樹」→「河西」 */
function familyName(name: string): string {
  return name.trim().split(/[\s　]+/)[0] || name;
}

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

/** 本文の1行目（引き継ぎのプレビュー用） */
function firstLine(text: string): string {
  return text.trim().split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
}

/** 見出し右の小さな導線（「予定を見る ›」など） */
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-0.5 text-[15px] font-medium", DEEP)}>
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
    // 明日以降の自分の現場入り（「これからの予定」）
    db.siteVisit.findMany({
      where: { userId: user.id, date: { gte: tomorrowStart } },
      include: { site: { select: { id: true, name: true, address: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 3,
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
  const [crewVisits, openHandovers, upcomingEvents] = await Promise.all([
    visitSiteIds.length
      ? db.siteVisit.findMany({
          where: { siteId: { in: visitSiteIds }, date: today },
          select: { siteId: true, user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    // 対応中の引き継ぎ（全員の画面に残るもの。確認はアプリ起動時のゲートと現場詳細で）
    visitSiteIds.length
      ? db.handover.findMany({
          where: { siteId: { in: visitSiteIds }, resolvedAt: null },
          orderBy: { createdAt: "desc" },
          select: { siteId: true, content: true },
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
  ]);

  const reportBySiteId = new Map(myReportsToday.map((r) => [r.siteId, r]));

  const crewBySite = new Map<string, string[]>();
  for (const v of crewVisits) {
    const list = crewBySite.get(v.siteId) ?? [];
    list.push(familyName(v.user.name));
    crewBySite.set(v.siteId, list);
  }
  const handoversBySite = new Map<string, string[]>();
  for (const h of openHandovers) {
    const list = handoversBySite.get(h.siteId) ?? [];
    list.push(h.content);
    handoversBySite.set(h.siteId, list);
  }
  // 現場の予定（今日）：時間帯と作業名に使う。自分が参加者のものを優先する
  function siteEventToday(siteId: string) {
    const events = todayEvents.filter((e) => e.siteId === siteId && e.source === "MANUAL");
    return events.find((e) => e.participants.some((p) => p.userId === user.id)) ?? events[0];
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

  return (
    <div className="min-h-dvh bg-surface">
      <div aria-hidden className="safe-top" />
      <PageContainer size="narrow" className="pb-2 pt-3 md:pt-6">
        {/* ── ヘッダー：日付ピル・通知・メニュー ── */}
        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?view=day&d=${todayKey}`}
            className={cn("flex items-center gap-2.5 rounded-full py-2.5 pl-4 pr-6 text-ink active:opacity-80", TINT)}
          >
            <CalendarDays className="h-6 w-6 shrink-0" strokeWidth={1.8} aria-hidden />
            <span className="text-[1.375rem] font-bold tnum">
              {todayDate.getMonth() + 1}月{todayDate.getDate()}日
            </span>
            <span className="text-[15px] font-medium text-ink-soft">
              {WEEKDAYS[todayDate.getDay()]}曜日
            </span>
          </Link>
          <Link
            href="/notifications"
            aria-label={unreadNotifications > 0 ? `通知（未読 ${unreadNotifications} 件）` : "通知"}
            className="relative ml-auto flex h-12 w-12 items-center justify-center text-ink active:opacity-70"
          >
            <Bell className="h-7 w-7" strokeWidth={1.8} />
            {unreadNotifications > 0 && (
              <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-[#2f7a5c] ring-2 ring-surface dark:bg-brand-600" />
            )}
          </Link>
          <Link
            href="/menu"
            aria-label="メニュー"
            className="flex h-12 w-12 items-center justify-center text-ink active:opacity-70"
          >
            <Ellipsis className="h-7 w-7" strokeWidth={2.2} />
          </Link>
        </div>
        <div className="mt-4 h-[3px] rounded-full bg-[#245f4b] dark:bg-brand-600" aria-hidden />

        {/* ── ① 今日の現場 ── */}
        <section className="pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-ink">今日の現場</h2>
            <SectionLink href={`/calendar?view=day&d=${todayKey}`} label="予定を見る" />
          </div>

          {todayVisits.length === 0 ? (
            <p className="py-8 text-[15px] text-ink-muted">今日の現場の予定はありません</p>
          ) : (
            todayVisits.map((v, i) => {
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
                <div key={v.id} className={cn("pb-1", i === 0 ? "pt-5" : "mt-6 border-t border-line pt-6")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xl font-bold tnum text-ink">{time ?? " "}</p>
                    <span className="shrink-0 rounded-full bg-[#dcebe0] px-4 py-1.5 text-[15px] font-medium text-[#245f4b] dark:bg-brand-200 dark:text-brand-800">
                      {SITE_STATUS_LABEL[v.site.siteStatus as SiteStatus] ?? v.site.siteStatus}
                    </span>
                  </div>
                  <h3
                    className={cn(
                      "mt-2 break-words font-black leading-tight tracking-tight text-ink",
                      // 短い現場名（「田村邸」など）は大きく、長い名前は折り返しても読める大きさに
                      v.site.name.length > 10 ? "text-[2rem]" : "text-[2.75rem]",
                    )}
                  >
                    {v.site.name}
                  </h3>
                  {work && <p className="mt-1.5 text-lg text-ink-soft">{work}</p>}
                  {(area || crew.length > 0) && (
                    <div className="mt-4 flex items-center gap-4 text-[15px] text-ink-soft">
                      {area && (
                        <span className="flex min-w-0 items-center gap-2">
                          <MapPin className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
                          <span className="truncate">{area}</span>
                        </span>
                      )}
                      {area && crew.length > 0 && <span className="h-7 w-px shrink-0 bg-line-strong" aria-hidden />}
                      {crew.length > 0 && (
                        <span className="flex min-w-0 items-center gap-2">
                          <Users className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
                          <span className="truncate">担当　{crew.join("・")}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {handovers.length > 0 && (
                    <Link
                      href={`/sites/${v.siteId}`}
                      className="mt-5 flex items-center gap-4 rounded-lg bg-amber-50 px-5 py-4 active:opacity-80 dark:bg-amber-950/40"
                    >
                      <FileText className="h-8 w-8 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={1.6} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-amber-800 dark:text-amber-300">
                          引き継ぎ {handovers.length}件
                        </p>
                        <p className="mt-0.5 truncate text-[15px] text-ink-soft">{firstLine(handovers[0])}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                    </Link>
                  )}

                  <Link
                    href={`/sites/${v.siteId}`}
                    className="relative mt-3 flex min-h-[56px] items-center justify-center rounded-lg bg-[#245f4b] px-12 text-lg font-bold text-white active:bg-[#1b4a3a] dark:bg-brand-600 dark:text-brand-950"
                  >
                    現場の詳細を見る
                    <ChevronRight className="absolute right-5 h-6 w-6" aria-hidden />
                  </Link>
                </div>
              );
            })
          )}
        </section>

        {/* ── ② 今日の日報（帯で区切る） ── */}
        {target && reportAction && (
          <section className={cn("-mx-4 mt-6 px-4 py-6 md:-mx-8 md:px-8", TINT)}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-xl font-bold text-ink">今日の日報</h2>
                  {allSubmitted ? (
                    <span className="rounded-full bg-[#dcebe0] px-3.5 py-1 text-sm font-medium text-[#245f4b] dark:bg-brand-200 dark:text-brand-800">
                      提出済み
                    </span>
                  ) : targetReport?.status === "DRAFT" ? (
                    <span className="rounded-full bg-amber-100 px-3.5 py-1 text-sm font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      下書き
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-3.5 py-1 text-sm font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      未提出
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[15px] text-ink-muted">
                  {allSubmitted
                    ? "今日の内容は記録済みです"
                    : todayVisits.length > 1
                      ? `${target.site.name}（${submittedCount}/${todayVisits.length} 提出）`
                      : "作業後に今日の内容を記録"}
                </p>
              </div>
              <Link
                href={reportAction.href}
                className="flex min-h-[52px] shrink-0 items-center gap-2 rounded-lg border-2 border-[#245f4b] bg-surface px-4 text-base font-bold text-ink active:bg-[#eef4ef] dark:border-brand-600"
              >
                {reportAction.label}
                <ChevronRight className="h-5 w-5" aria-hidden />
              </Link>
            </div>
          </section>
        )}

        {/* 管理者：全体の日報の到着状況（同じ帯の形で） */}
        {admin && (
          <section
            className={cn(
              "-mx-4 px-4 py-6 md:-mx-8 md:px-8",
              TINT,
              target ? "border-t border-[#dcebe0] dark:border-brand-200" : "mt-6",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-xl font-bold text-ink">日報の到着</h2>
                  {dispatch.going > 0 &&
                    (dispatchPending > 0 ? (
                      <span className="rounded-full bg-red-100 px-3.5 py-1 text-sm font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                        未提出 {dispatchPending}名
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#dcebe0] px-3.5 py-1 text-sm font-medium text-[#245f4b] dark:bg-brand-200 dark:text-brand-800">
                        全員提出
                      </span>
                    ))}
                </div>
                <p className="mt-1.5 text-[15px] text-ink-muted">
                  {dispatch.going > 0
                    ? `提出 ${dispatch.submitted} / ${dispatch.going} 名`
                    : "本日の配員はまだ組まれていません"}
                </p>
              </div>
              <Link
                href={`/dispatch?d=${todayKey}`}
                className="flex min-h-[52px] shrink-0 items-center gap-2 rounded-lg border-2 border-[#245f4b] bg-surface px-4 text-base font-bold text-ink active:bg-[#eef4ef] dark:border-brand-600"
              >
                {dispatch.going > 0 ? "状況を見る" : "配員する"}
                <ChevronRight className="h-5 w-5" aria-hidden />
              </Link>
            </div>
            {dispatchPending > 0 && <RemindReportsButton pendingCount={dispatchPending} />}
          </section>
        )}

        {/* ── ③ これからの予定 ── */}
        <section className="pt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-ink">これからの予定</h2>
            <SectionLink href="/calendar" label="すべて見る" />
          </div>
          {upcomingVisits.length === 0 ? (
            <p className="border-b border-line py-6 text-[15px] text-ink-muted">
              これからの現場の予定はありません
            </p>
          ) : (
            <ul className="mt-3">
              {upcomingVisits.map((v) => {
                const key = storedDateKey(v.date);
                const d = dateFromKey(key);
                const time = timeRange(siteEventOn(v.siteId, v.date));
                const area = areaOf(v.site.address);
                return (
                  <li key={v.id} className="border-b border-line">
                    <Link
                      href={`/sites/${v.siteId}`}
                      className="flex items-center gap-5 py-4 active:opacity-70"
                    >
                      <div className="w-12 shrink-0 text-center">
                        <p className={cn("text-sm", DEEP)}>
                          {key === tmrwKey ? "明日" : WEEKDAYS[d.getDay()]}
                        </p>
                        <p className="text-xl font-medium tnum text-ink">
                          {d.getMonth() + 1}/{d.getDate()}
                        </p>
                      </div>
                      <span className="h-14 w-px shrink-0 bg-line-strong" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold text-ink">{v.site.name}</p>
                        {(time || area) && (
                          <p className="mt-1 truncate text-[15px] text-ink-muted tnum">
                            {[time, area].filter(Boolean).join("  •  ")}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-6 w-6 shrink-0 text-ink" aria-hidden />
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
            className="flex items-center gap-3 border-t border-line py-4 text-sm text-ink-soft active:opacity-70"
          >
            <Building2 className="h-6 w-6 shrink-0 text-ink-faint" strokeWidth={1.6} aria-hidden />
            <span className="flex-1">現場の登録内容を確認（{provisionalSites.length}件）</span>
            <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
          </Link>
        )}
      </PageContainer>
    </div>
  );
}
