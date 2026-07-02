import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ReportCard } from "@/components/report-card";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { fmtDateWithDay } from "@/lib/utils";

export default async function SiteReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const site = await db.site.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      assignments: { select: { userId: true } },
    },
  });
  if (!site) notFound();

  // 認可: 管理者以外かつ未割当の現場は 404（id 直打ち閲覧の防止）
  if (!isAdmin(user) && !site.assignments.some((a) => a.userId === user.id)) {
    notFound();
  }

  const reports = await db.dailyReport.findMany({
    where: { siteId: id },
    include: {
      user: { select: { name: true, avatarColor: true } },
      _count: { select: { photos: true, comments: true, materials: true } },
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "asc" }],
  });

  // 作業日ごとにグループ化（降順）。同一日に複数人分が並列。
  const groups = new Map<string, typeof reports>();
  for (const r of reports) {
    const key = new Date(r.workDate).toISOString().slice(0, 10);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  return (
    <div>
      <PageHeader
        title="日報一覧"
        subtitle={site.name}
        backHref={`/sites/${site.id}`}
        right={
          <LinkButton href={`/reports/new?siteId=${site.id}`} size="sm">
            <Plus className="h-4 w-4" />日報を書く
          </LinkButton>
        }
      />
      <PageContainer>
        {reports.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="まだ日報がありません"
            description="この現場の最初の日報を作成しましょう"
            action={
              <LinkButton href={`/reports/new?siteId=${site.id}`} size="sm">
                <Plus className="h-4 w-4" />日報を書く
              </LinkButton>
            }
          />
        ) : (
          <div className="space-y-5">
            {[...groups.entries()].map(([key, dayReports]) => (
              <section key={key} className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <h2 className="text-sm font-bold text-ink-soft">
                    {fmtDateWithDay(dayReports[0].workDate)}
                  </h2>
                  <span className="text-xs font-medium text-ink-faint">
                    {dayReports.length}名
                  </span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {dayReports.map((r) => (
                    <ReportCard key={r.id} report={r} showSite={false} showDate={false} />
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
