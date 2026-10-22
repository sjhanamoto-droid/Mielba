import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/settings";
import { todayRange } from "@/lib/date";
import { isNonWorkEventCategory } from "@/lib/constants";

// 日報の「次回の作業日」まわりの共通処理（日報の保存・確認日の全画面・毎朝の通知で使う）。

/**
 * 日報で決まった次回作業日を予定（カレンダー）に入れる。date が null なら消すだけ。
 * この日報から作った予定（source=PROCESS）は誰でもカレンダーで編集できるので、
 * 既にあれば作り直さず日付だけ合わせる（カレンダーで足した参加者・時間を消さない）。
 * 新しく作るときは参加者を付けない（配員は今までどおり管理者が組む）。
 */
export async function syncNextWorkEvent(
  reportId: string,
  siteId: string,
  date: Date | null,
  createdById: string,
): Promise<void> {
  if (!date) {
    await db.calendarEvent.deleteMany({ where: { reportId, source: "PROCESS" } });
    return;
  }
  const existing = await db.calendarEvent.findFirst({
    where: { reportId, source: "PROCESS" },
    select: { id: true, siteId: true, date: true, participants: { select: { userId: true } } },
  });
  if (existing) {
    if (existing.date.getTime() === date.getTime()) return;
    await db.calendarEvent.update({ where: { id: existing.id }, data: { date } });
    // 参加者がいれば、現場入り（配員）も新しい日付へ移す（旧日付に日報がある人の現場入りは残す）
    const userIds = existing.participants.map((p) => p.userId);
    const eventSiteId = existing.siteId ?? siteId;
    if (userIds.length > 0) {
      for (const userId of userIds) {
        await db.siteVisit.upsert({
          where: { siteId_userId_date: { siteId: eventSiteId, userId, date } },
          update: {},
          create: { siteId: eventSiteId, userId, date, createdById },
        });
      }
      const reported = await db.dailyReport.findMany({
        where: { siteId: eventSiteId, workDate: existing.date, userId: { in: userIds } },
        select: { userId: true },
      });
      const keep = new Set(reported.map((r) => r.userId));
      // 同じ日・同じ現場に残る別の作業予定の参加者も残す（カレンダー側の掃除と同じ考え方）
      const others = await db.calendarEvent.findMany({
        where: { siteId: eventSiteId, date: existing.date, id: { not: existing.id } },
        select: { category: true, participants: { select: { userId: true } } },
      });
      for (const e of others) {
        if (isNonWorkEventCategory(e.category)) continue;
        for (const p of e.participants) keep.add(p.userId);
      }
      await db.siteVisit.deleteMany({
        where: {
          siteId: eventSiteId,
          date: existing.date,
          userId: { in: userIds.filter((u) => !keep.has(u)) },
        },
      });
    }
    return;
  }
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
