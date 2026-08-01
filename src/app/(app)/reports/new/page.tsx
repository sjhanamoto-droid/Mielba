import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ReportForm } from "@/features/reports/report-form";
import { MainVoteGate } from "@/features/reports/main-vote-gate";
import { getMainVoteState } from "@/features/reports/main-vote-actions";
import { getAppSettings } from "@/lib/settings";
import { fmtDateWithDay } from "@/lib/utils";
import { todayRange, jstDateKey } from "@/lib/date";
import { Crown } from "lucide-react";

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

  // メインの人（全員一致投票）: 当日その現場の配員が2人以上で、自分も配員なら、
  // 全員一致（consensus）が確定するまで日報フォームではなく投票ゲートを表示する。
  const dateKey = jstDateKey();
  const voteState = await getMainVoteState(site.id, dateKey);
  const showGate =
    voteState.members.length >= 2 &&
    voteState.isMember &&
    voteState.consensus == null;

  // 材料・在庫の入力可否: consensus 未確定なら誰でも可（単独現場・非member含む）。
  // 確定済みでも 非member（管理者代理入力等）はブロックしない。member のときのみ
  // 「メインの人」本人だけ入力可（それ以外の配員はロック）。
  const canInputMaterials =
    voteState.consensus == null
      ? true
      : voteState.isMember
        ? voteState.consensus === user.id
        : true;
  const mainName =
    voteState.consensus != null
      ? voteState.members.find((m) => m.userId === voteState.consensus)?.name ?? null
      : null;

  if (showGate) {
    return (
      <div>
        <PageHeader
          title="日報・勤怠を作成"
          subtitle={fmtDateWithDay(todayRange().gte)}
          backHref={`/sites/${site.id}/reports`}
        />
        <PageContainer size="narrow">
          <MainVoteGate
            siteId={site.id}
            dateKey={dateKey}
            siteName={site.name}
            initial={voteState}
          />
        </PageContainer>
      </div>
    );
  }

  // この現場・本日の予定（自分が参加者 or 担当）を日報の基盤として取得
  // 「今日」は Asia/Tokyo の暦日で判定する（Vercel=UTC対策）
  const { gte: today, lt: tomorrow } = todayRange();
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

  // 材料マスター（使用材料のセレクト候補）
  const materialOptions = await db.materialMaster.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, unit: true },
  });

  // 予定に時刻があればそれを日報の作業時間の初期値に採用
  const defaultStartTime = event?.startTime ?? settings.defaultStartTime;
  const defaultEndTime = event?.endTime ?? settings.defaultEndTime;

  return (
    <div>
      <PageHeader
        title="日報・勤怠を作成"
        subtitle={fmtDateWithDay(today)}
        backHref={`/sites/${site.id}/reports`}
      />
      <PageContainer size="narrow">
        {mainName && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
            <Crown className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <span className="text-ink-soft">
              メインの人：<span className="font-bold text-ink">{mainName}</span>
              {!canInputMaterials && "（材料・在庫はメインの人が入力します）"}
            </span>
          </div>
        )}
        <ReportForm
          mode="new"
          siteId={site.id}
          siteName={site.name}
          defaultStartTime={defaultStartTime}
          defaultEndTime={defaultEndTime}
          materialOptions={materialOptions}
          canInputMaterials={canInputMaterials}
          aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
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
