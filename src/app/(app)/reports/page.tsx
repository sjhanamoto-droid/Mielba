import Link from "next/link";
import { FileText, Plus, Check, PenLine, HardHat, ChevronDown, ChevronRight } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SectionTitle } from "@/components/ui/card";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { ReportCard, ReportStatusPill } from "@/components/report-card";
import { AddMyVisit } from "@/features/visits/add-my-visit";
import { cn, fmtDateWithDay } from "@/lib/utils";
import { todayRange, jstDateKey } from "@/lib/date";

const PAGE_SIZE = 20;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default async function ReportsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ take?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);

  // 「今日」は Asia/Tokyo の暦日で判定する（Vercel=UTCで朝9時まで前日扱いになるバグの修正）
  const { gte: today, lt: tomorrow } = todayRange();
  const todayStr = jstDateKey();

  // ─────────────── スタッフ：日報の最短入力ハブ ───────────────
  if (!admin) {
    // 互いに独立した4クエリを1波で並列取得（本番PostgreSQLの往復回数を削減）
    const [todayVisits, todayReports, activeSites, myRecent] = await Promise.all([
      // 今日の現場入り（出面）。日報はこれに連動する（配属ではなく当日行く現場）。
      db.siteVisit.findMany({
        where: { userId: user.id, date: { gte: today, lt: tomorrow } },
        include: { site: { include: { customer: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      }),
      db.dailyReport.findMany({
        where: { userId: user.id, workDate: { gte: today, lt: tomorrow } },
        select: { id: true, siteId: true, status: true },
      }),
      // 「別の現場に行った」候補：進行中と現調の全現場から（担当の区別は廃止）
      db.site.findMany({
        where: { siteStatus: { in: ["ACTIVE", "SURVEY"] } },
        select: {
          id: true,
          name: true,
          siteStatus: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      db.dailyReport.findMany({
        where: { userId: user.id },
        include: {
          user: { select: { name: true, avatarColor: true, avatarImage: true } },
          site: { select: { id: true, name: true } },
          _count: { select: { photos: true, comments: true, materials: true } },
        },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 10,
      }),
    ]);
    const byId = new Map(todayReports.map((r) => [r.siteId, r]));

    // 今日まだ現場入りしていない進行中の現場（配属現場を上にグループ表示）
    const visitedSiteIds = new Set(todayVisits.map((v) => v.siteId));
    const addableSites = activeSites
      .filter((s) => !visitedSiteIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name }));

    return (
      <div>
        <PageHeader title="日報" subtitle="今日の現場の日報を書きましょう" />
        <PageContainer>
          <div className="space-y-6">
            {/* 今日の現場入り（出面）— 日報はここから。行っていない現場は出ない。 */}
            <section className="space-y-2.5">
              <SectionTitle>今日の現場入り（{fmtDateWithDay(today)}）</SectionTitle>
              {todayVisits.length === 0 ? (
                <div className="space-y-2.5">
                  <EmptyState
                    icon={<HardHat className="h-6 w-6" />}
                    title="今日の現場入りはまだありません"
                    description="管理者の配員、または「別の現場に行った」から登録できます"
                  />
                  <AddMyVisit sites={addableSites} dateStr={todayStr} />
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {todayVisits.map((v) => {
                      const r = byId.get(v.siteId);
                      const status = r?.status; // undefined | "DRAFT" | "SUBMITTED"
                      return (
                        <div key={v.id} className="card flex flex-col p-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p
                                className={cn(
                                  "min-w-0 break-words font-bold leading-tight text-ink",
                                  v.site.name.length > 10 ? "text-xl" : "text-2xl",
                                )}
                              >
                                {v.site.name}
                              </p>
                              {status ? (
                                <ReportStatusPill status={status} className="mt-0.5" />
                              ) : v.site.siteStatus === "SURVEY" ? null : (
                                <span className="mt-0.5 shrink-0 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                                  未入力
                                </span>
                              )}
                            </div>
                            {v.site.customer && (
                              <p className="mt-1 truncate text-[15px] text-ink-soft">
                                {v.site.customer.name}
                              </p>
                            )}
                          </div>
                          <div className="mt-4">
                            {status === "SUBMITTED" ? (
                              <Link
                                href={`/reports/${r!.id}`}
                                className={buttonClass({
                                  variant: "outline",
                                  size: "lg",
                                  className: "relative w-full border-brand-200 text-brand-700 dark:border-brand-800",
                                })}
                              >
                                <Check className="h-5 w-5" />提出済み・確認する
                                <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
                              </Link>
                            ) : status === "DRAFT" ? (
                              <LinkButton href={`/reports/${r!.id}/edit`} variant="accent" size="lg" className="relative w-full">
                                <PenLine className="h-5 w-5" />下書きの続きを書く
                                <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
                              </LinkButton>
                            ) : v.site.siteStatus === "SURVEY" ? (
                              // 現調中の現場は日報ではなく現調フォーマットを書く
                              <LinkButton href={`/sites/${v.siteId}/survey`} size="lg" className="relative w-full">
                                <Plus className="h-5 w-5" />現調フォーマットを書く
                                <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
                              </LinkButton>
                            ) : (
                              <LinkButton href={`/reports/new?siteId=${v.siteId}`} size="lg" className="relative w-full">
                                <Plus className="h-5 w-5" />日報を書く
                                <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
                              </LinkButton>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <AddMyVisit sites={addableSites} dateStr={todayStr} />
                </div>
              )}
            </section>

            {/* 最近の自分の日報 */}
            <section className="space-y-2.5">
              <SectionTitle>最近の日報</SectionTitle>
              {myRecent.length === 0 ? (
                <EmptyState icon={<FileText className="h-6 w-6" />} title="まだ日報がありません" />
              ) : (
                <div className="card divide-y divide-line overflow-hidden">
                  {myRecent.map((r) => (
                    <ReportCard key={r.id} report={r} showSite variant="row" />
                  ))}
                </div>
              )}
            </section>
          </div>
        </PageContainer>
      </div>
    );
  }

  // ─────────────── 管理者：日報の全体確認（現場の動き） ───────────────
  // ページネーション：20件＋「さらに表示」（?take=）
  const { take: takeRaw } = await searchParams;
  const parsedTake = Number.parseInt(takeRaw ?? "", 10);
  const take = Number.isFinite(parsedTake)
    ? Math.min(Math.max(parsedTake, PAGE_SIZE), 500)
    : PAGE_SIZE;

  // 1件多く取得して「さらに表示」の有無を判定する
  const fetched = await db.dailyReport.findMany({
    include: {
      user: { select: { name: true, avatarColor: true, avatarImage: true } },
      site: { select: { id: true, name: true } },
      _count: { select: { photos: true, comments: true, materials: true } },
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: take + 1,
  });
  const hasMore = fetched.length > take;
  const recent = hasMore ? fetched.slice(0, take) : fetched;

  // 作業日でグループ化
  const groups: { key: string; date: Date; items: typeof recent }[] = [];
  const map = new Map<string, { date: Date; items: typeof recent }>();
  for (const r of recent) {
    const k = dayKey(r.workDate);
    const g = map.get(k);
    if (g) g.items.push(r);
    else {
      const ng = { date: r.workDate, items: [r] };
      map.set(k, ng);
      groups.push({ key: k, date: r.workDate, items: ng.items });
    }
  }

  return (
    <div>
      <PageHeader
        title="日報"
        subtitle="現場の動きを確認"
        right={
          <LinkButton href="/dispatch" variant="ghost" size="sm">
            <HardHat className="h-4 w-4" />配員
          </LinkButton>
        }
      />
      <PageContainer>
        {recent.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="まだ日報がありません" />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.key} className="space-y-2.5">
                <SectionTitle
                  action={<span className="text-sm font-semibold text-ink-muted tnum">{g.items.length}件</span>}
                >
                  <span className="tnum">{fmtDateWithDay(g.date)}</span>
                </SectionTitle>
                <div className="card divide-y divide-line overflow-hidden">
                  {g.items.map((r) => (
                    <ReportCard key={r.id} report={r} showSite showDate={false} variant="row" />
                  ))}
                </div>
              </section>
            ))}

            {hasMore && (
              <Link
                href={`/reports?take=${take + PAGE_SIZE}`}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-surface-subtle py-3 text-sm font-semibold text-ink-muted active:scale-[0.99]"
              >
                <ChevronDown className="h-4 w-4" />
                さらに表示（次の{PAGE_SIZE}件）
              </Link>
            )}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
