import { notFound, redirect } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ReportForm, type ReportFormData } from "@/features/reports/report-form";
import type { PhotoKind } from "@/lib/constants";

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const report = await db.dailyReport.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, name: true } },
      materials: true,
      orders: true,
      nextProcesses: true,
      photos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!report) notFound();

  // 認可: 本人または管理者のみ編集可
  if (report.userId !== user.id && !isAdmin(user)) {
    redirect(`/reports/${report.id}`);
  }

  const initial: ReportFormData = {
    id: report.id,
    workDate: report.workDate,
    startTime: report.startTime,
    endTime: report.endTime,
    detail: report.detail,
    aiSummary: report.aiSummary,
    memo: report.memo,
    materials: report.materials.map((m) => ({
      name: m.name,
      quantity: m.quantity,
      unit: m.unit,
    })),
    orders: report.orders.map((o) => ({
      name: o.name,
      quantity: o.quantity,
      supplier: o.supplier,
      deliveryDate: o.deliveryDate,
    })),
    nextProcesses: report.nextProcesses.map((p) => ({
      content: p.content,
      vendors: p.vendors,
      supplyDeliveryDate: p.supplyDeliveryDate,
    })),
    photos: report.photos.map((p) => ({
      dataUrl: p.dataUrl,
      caption: p.caption ?? "",
      kind: (p.kind as PhotoKind) ?? "WORK",
      isVideo: p.isVideo,
      width: p.width ?? undefined,
      height: p.height ?? undefined,
    })),
  };

  return (
    <div>
      <PageHeader
        title="日報・勤怠を編集"
        subtitle={report.site.name}
        backHref={`/reports/${report.id}`}
      />
      <PageContainer size="narrow">
        <ReportForm
          mode="edit"
          siteId={report.site.id}
          siteName={report.site.name}
          initial={initial}
        />
      </PageContainer>
    </div>
  );
}
