import { notFound, redirect } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ReportForm, type ReportFormData } from "@/features/reports/report-form";
import type { PhotoKind } from "@/lib/constants";
import { jstDateKey, dayRangeForKey } from "@/lib/date";

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
      expenses: { orderBy: { sortOrder: "asc" } },
      // base64（dataUrl/thumbUrl）はRSCペイロードに載せない（既存写真は {id} 参照で維持）
      photos: {
        select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!report) notFound();

  // 認可: 本人または管理者のみ編集可
  if (report.userId !== user.id && !isAdmin(user)) {
    redirect(`/reports/${report.id}`);
  }

  // 材料マスター（使用材料のセレクト候補）
  const materialOptions = await db.materialMaster.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, unit: true },
  });

  // メインの人（全員一致投票）: この日報の作業日・現場で consensus が確定していれば、
  // 材料・在庫はメイン本人（＝日報の所有者と一致する場合）のみ入力可。未確定なら誰でも可。
  const { gte, lt } = dayRangeForKey(jstDateKey(report.workDate));
  const visits = await db.siteVisit.findMany({
    where: { siteId: report.siteId, date: { gte, lt } },
    select: { userId: true, mainVote: true },
  });
  const firstVote = visits[0]?.mainVote ?? null;
  const consensus =
    visits.length > 0 && firstVote && visits.every((v) => v.mainVote === firstVote)
      ? firstVote
      : null;
  // 日報の所有者が配員でなければロックしない（単独・非member はブロックしない）
  const ownerIsMember = visits.some((v) => v.userId === report.userId);
  const canInputMaterials =
    consensus == null ? true : ownerIsMember ? consensus === report.userId : true;

  const initial: ReportFormData = {
    id: report.id,
    workDate: report.workDate,
    startTime: report.startTime,
    endTime: report.endTime,
    aiDraft: report.aiDraft,
    detail: report.detail,
    aiSummary: report.aiSummary,
    handover: report.handover,
    handoverNone: report.handoverNone,
    parkingFee: report.parkingFee,
    trainFare: report.trainFare,
    timeChangeReason: report.timeChangeReason,
    stockUsed: report.stockUsed,
    stockNote: report.stockNote,
    materials: report.materials.map((m) => ({
      name: m.name,
      quantity: m.quantity,
      unit: m.unit,
    })),
    expenses: report.expenses.map((e) => ({
      label: e.label,
      amount: e.amount,
    })),
    // 既存写真は {id} 参照のみ（base64 を再送しない）。プレビューは photoSrc(id, true)。
    photos: report.photos.map((p) => ({
      id: p.id,
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
          materialOptions={materialOptions}
          canInputMaterials={canInputMaterials}
          aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      </PageContainer>
    </div>
  );
}
