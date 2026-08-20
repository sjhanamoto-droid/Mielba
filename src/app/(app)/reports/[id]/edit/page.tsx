import { notFound, redirect } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ReportForm, type ReportFormData } from "@/features/reports/report-form";
import type { PhotoKind } from "@/lib/constants";
import { dedupeByName } from "@/lib/materials";
import { getAppSettings } from "@/lib/settings";
import { jstDateKey, storedDateKey, dayRangeForKey } from "@/lib/date";

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
      stockUses: true,
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

  // 使用材料のセレクト候補は「この日報の現場に登録された材料」。金額は渡さない（財務情報）。
  const siteMaterials = await db.siteMaterial.findMany({
    where: { siteId: report.siteId, active: true },
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, name: true, unit: true },
  });
  const materialOptions = dedupeByName(siteMaterials);

  // 在庫材料のセレクト候補は「在庫材料マスター（active）」。
  const stockOptions = await db.materialMaster.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, unit: true },
  });

  // メインの人（全員一致投票）: この日報の作業日・現場で consensus が確定していれば、
  // 材料・在庫はメイン本人（＝日報の所有者と一致する場合）のみ入力可。未確定なら誰でも可。
  // 注: この編集ページは投票ゲートを通らない（下書きの続きから提出できる）。
  // 投票が集まらず詰んだ場合の逃げ道として意図的に残している（管理者の代理確定も併用可）。
  const workDateKey = storedDateKey(report.workDate);
  const { gte, lt } = dayRangeForKey(workDateKey);
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

  // 所定時間（時間変更理由の基準）: 新規作成時と同じく、作業日のカレンダー予定の時刻 →
  // 無ければアプリ設定の既定時刻。8:00-17:00 固定だと予定通りの時間でも理由入力を求められるため。
  const settings = await getAppSettings();
  const event = await db.calendarEvent.findFirst({
    where: {
      siteId: report.siteId,
      date: { gte, lt },
      OR: [
        { participants: { some: { userId: report.userId } } },
        { ownerId: report.userId },
      ],
    },
    orderBy: [{ allDay: "asc" }, { startTime: "asc" }],
    select: { startTime: true, endTime: true },
  });
  const baseStartTime = event?.startTime ?? settings.defaultStartTime;
  const baseEndTime = event?.endTime ?? settings.defaultEndTime;

  const initial: ReportFormData = {
    id: report.id,
    status: report.status,
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
    stockUses: report.stockUses.map((m) => ({
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
          maxDate={jstDateKey()}
          defaultStartTime={baseStartTime}
          defaultEndTime={baseEndTime}
          materialOptions={materialOptions}
          stockOptions={stockOptions}
          canInputMaterials={canInputMaterials}
          aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      </PageContainer>
    </div>
  );
}
