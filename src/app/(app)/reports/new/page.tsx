import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ReportForm } from "@/features/reports/report-form";
import { getAppSettings } from "@/lib/settings";
import { fmtDateWithDay } from "@/lib/utils";

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const user = await requireUser();
  const { siteId } = await searchParams;
  if (!siteId) redirect("/sites");

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true },
  });
  if (!site) notFound();

  const settings = await getAppSettings();

  // この現場・本日の予定（自分が参加者 or 担当）を日報の基盤として取得
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const event = await db.calendarEvent.findFirst({
    where: {
      siteId: site.id,
      date: { gte: today, lt: tomorrow },
      OR: [
        { participants: { some: { userId: user.id } } },
        { ownerId: user.id },
      ],
    },
    orderBy: [{ allDay: "asc" }, { startTime: "asc" }],
    select: {
      title: true,
      category: true,
      startTime: true,
      endTime: true,
      note: true,
      allDay: true,
    },
  });

  // 予定に時刻があればそれを日報の作業時間の初期値に採用
  const defaultStartTime = event?.startTime ?? settings.defaultStartTime;
  const defaultEndTime = event?.endTime ?? settings.defaultEndTime;

  return (
    <div>
      <PageHeader
        title="日報・勤怠を作成"
        subtitle={fmtDateWithDay(new Date())}
        backHref={`/sites/${site.id}/reports`}
      />
      <PageContainer size="narrow">
        <ReportForm
          mode="new"
          siteId={site.id}
          siteName={site.name}
          defaultStartTime={defaultStartTime}
          defaultEndTime={defaultEndTime}
          eventContext={
            event
              ? {
                  title: event.title,
                  category: event.category,
                  startTime: event.startTime,
                  endTime: event.endTime,
                  allDay: event.allDay,
                  note: event.note,
                }
              : undefined
          }
        />
      </PageContainer>
    </div>
  );
}
