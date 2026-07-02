import Link from "next/link";
import { FileText, Plus, Check, PenLine, HardHat } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { ReportCard } from "@/components/report-card";
import { AddMyVisit } from "@/features/visits/add-my-visit";
import { fmtDateWithDay } from "@/lib/utils";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default async function ReportsHubPage() {
  const user = await requireUser();
  const admin = isAdmin(user);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // ─────────────── スタッフ：日報の最短入力ハブ ───────────────
  if (!admin) {
    // 今日の現場入り（出面）。日報はこれに連動する（配属ではなく当日行く現場）。
    const todayVisits = await db.siteVisit.findMany({
      where: { userId: user.id, date: { gte: today, lt: tomorrow } },
      include: { site: { include: { customer: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    const todayReports = await db.dailyReport.findMany({
      where: { userId: user.id, workDate: { gte: today, lt: tomorrow } },
      select: { id: true, siteId: true, status: true },
    });
    const byId = new Map(todayReports.map((r) => [r.siteId, r]));

    // 「別の現場に行った」候補：配属済みの進行中現場で、今日まだ現場入りしていない現場
    const visitedSiteIds = new Set(todayVisits.map((v) => v.siteId));
    const assignedActive = await db.site.findMany({
      where: { siteStatus: "ACTIVE", assignments: { some: { userId: user.id } } },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
    });
    const addableSites = assignedActive.filter((s) => !visitedSiteIds.has(s.id));
    const todayStr = dayKey(today);

    const myRecent = await db.dailyReport.findMany({
      where: { userId: user.id },
      include: {
        user: { select: { name: true, avatarColor: true } },
        site: { select: { id: true, name: true } },
        _count: { select: { photos: true, comments: true, materials: true } },
      },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 10,
    });

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
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {todayVisits.map((v) => {
                      const r = byId.get(v.siteId);
                      const status = r?.status; // undefined | "DRAFT" | "SUBMITTED"
                      return (
                        <div key={v.id} className="card flex flex-col p-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-bold text-ink">{v.site.name}</p>
                            {v.site.customer && (
                              <p className="mt-0.5 truncate text-xs font-medium text-brand-600">
                                {v.site.customer.name}
                              </p>
                            )}
                          </div>
                          <div className="mt-3">
                            {status === "SUBMITTED" ? (
                              <Link
                                href={`/reports/${r!.id}`}
                                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700"
                              >
                                <Check className="h-4 w-4" />提出済み・確認する
                              </Link>
                            ) : status === "DRAFT" ? (
                              <LinkButton href={`/reports/${r!.id}/edit`} variant="accent" size="md" className="w-full">
                                <PenLine className="h-4 w-4" />下書きの続きを書く
                              </LinkButton>
                            ) : (
                              <LinkButton href={`/reports/new?siteId=${v.siteId}`} size="md" className="w-full">
                                <Plus className="h-4 w-4" />日報を書く
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
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {myRecent.map((r) => (
                    <ReportCard key={r.id} report={r} showSite />
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
  const recent = await db.dailyReport.findMany({
    include: {
      user: { select: { name: true, avatarColor: true } },
      site: { select: { id: true, name: true } },
      _count: { select: { photos: true, comments: true, materials: true } },
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: 40,
  });

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
                <div className="flex items-center gap-2 px-1">
                  <h2 className="text-sm font-bold text-ink-soft">{fmtDateWithDay(g.date)}</h2>
                  <Badge tone="neutral">{g.items.length}件</Badge>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((r) => (
                    <ReportCard key={r.id} report={r} showSite showDate={false} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
