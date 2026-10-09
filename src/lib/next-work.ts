import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/settings";
import { todayRange } from "@/lib/date";

// 日報の「次回の作業日」まわりの共通処理（日報の保存・確認日の全画面・毎朝の通知で使う）。

/**
 * 日報で決まった次回作業日を予定（カレンダー）に入れる。
 * この日報から作った予定（source=PROCESS）を作り直す。date が null なら消すだけ。
 * 参加者は付けない（配員は今までどおり管理者が組む）。
 */
export async function syncNextWorkEvent(
  reportId: string,
  siteId: string,
  date: Date | null,
  createdById: string,
): Promise<void> {
  await db.calendarEvent.deleteMany({ where: { reportId, source: "PROCESS" } });
  if (!date) return;
  const [site, settings] = await Promise.all([
    db.site.findUnique({ where: { id: siteId }, select: { name: true } }),
    getAppSettings(),
  ]);
  await db.calendarEvent.create({
    data: {
      title: site?.name ?? "次回作業",
      date,
      siteId,
      category: "WORK",
      startTime: settings.defaultStartTime,
      endTime: settings.defaultEndTime,
      allDay: false,
      source: "PROCESS",
      reportId,
      createdById,
    },
  });
}

/**
 * 同じ現場の、ほかの日報に残っている「未定（確認待ち）」を片づける。
 * 新しい日報で次回作業日を残したら、古い確認日で止めないようにする。
 */
export async function resolveOlderNextWorkChecks(siteId: string, exceptReportId: string): Promise<void> {
  await db.dailyReport.updateMany({
    where: {
      siteId,
      id: { not: exceptReportId },
      nextWorkChoice: "UNDECIDED",
      nextCheckResolvedAt: null,
    },
    data: { nextCheckResolvedAt: new Date() },
  });
}

export type DueNextWorkCheck = {
  reportId: string;
  siteId: string;
  siteName: string;
  workDate: Date;
  nextCheckDate: Date;
};

/** 確認日が今日以前で、まだ片づいていない「次回作業日 未定」（本人の提出済み日報のみ・古い順） */
export async function getDueNextWorkChecks(userId: string): Promise<DueNextWorkCheck[]> {
  const { lt: tomorrow } = todayRange();
  const rows = await db.dailyReport.findMany({
    where: {
      userId,
      status: "SUBMITTED",
      nextWorkChoice: "UNDECIDED",
      nextCheckResolvedAt: null,
      nextCheckDate: { lt: tomorrow },
    },
    orderBy: [{ nextCheckDate: "asc" }, { workDate: "asc" }],
    select: {
      id: true,
      siteId: true,
      workDate: true,
      nextCheckDate: true,
      site: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    reportId: r.id,
    siteId: r.siteId,
    siteName: r.site.name,
    workDate: r.workDate,
    nextCheckDate: r.nextCheckDate!,
  }));
}
