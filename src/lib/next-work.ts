import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/settings";
import { todayRange } from "@/lib/date";
import { isNonWorkEventCategory } from "@/lib/constants";
import { recordNotDuplicate } from "@/lib/nearby-events";

// 日報の「次回の作業日」まわりの共通処理（日報の保存・確認日の全画面・毎朝の通知で使う）。

type LinkedEvent = {
  id: string;
  siteId: string | null;
  date: Date;
  reportId?: string | null;
  participants: { userId: string }[];
};

// 日報に結び付けられる予定：手動の予定と次回工程の、作業（または種類なし）の予定
const LINKABLE_SOURCES = ["MANUAL", "PROCESS"];
const linkableWhere = {
  isPrivate: false,
  source: { in: LINKABLE_SOURCES },
  OR: [{ category: null }, { category: "WORK" }],
};

/**
 * (siteId, date) の現場入り（配員）から userIds を外す。ただし次の人は残す：
 * その日その現場に日報がある人／同じ日同じ現場に残る別の作業予定（excludeEventIds 以外）に入っている人。
 */
async function pruneVisitsFor(
  siteId: string,
  date: Date,
  userIds: string[],
  excludeEventIds: string[],
): Promise<void> {
  const targets = [...new Set(userIds)];
  if (targets.length === 0) return;
  const reported = await db.dailyReport.findMany({
    where: { siteId, workDate: date, userId: { in: targets } },
    select: { userId: true },
  });
  const keep = new Set(reported.map((r) => r.userId));
  const others = await db.calendarEvent.findMany({
    where: { siteId, date, id: { notIn: excludeEventIds } },
    select: { category: true, participants: { select: { userId: true } } },
  });
  for (const e of others) {
    if (isNonWorkEventCategory(e.category)) continue;
    for (const p of e.participants) keep.add(p.userId);
  }
  const removable = targets.filter((u) => !keep.has(u));
  if (removable.length > 0) {
    await db.siteVisit.deleteMany({ where: { siteId, date, userId: { in: removable } } });
  }
}

async function upsertVisits(siteId: string, userIds: string[], date: Date, createdById: string) {
  for (const userId of new Set(userIds)) {
    await db.siteVisit.upsert({
      where: { siteId_userId_date: { siteId, userId, date } },
      update: {},
      create: { siteId, userId, date, createdById },
    });
  }
}

/**
 * 予定の日付だけを動かす。参加者がいれば現場入り（配員）も新しい日付へ移す
 * （旧日付に日報がある人・同じ日同じ現場の別の作業予定に入っている人の現場入りは残す）。
 */
async function moveEventDate(
  existing: LinkedEvent,
  siteId: string,
  date: Date,
  createdById: string,
): Promise<void> {
  if (existing.date.getTime() === date.getTime()) return;
  await db.calendarEvent.update({ where: { id: existing.id }, data: { date } });
  const userIds = existing.participants.map((p) => p.userId);
  const eventSiteId = existing.siteId ?? siteId;
  if (userIds.length === 0) return;
  await upsertVisits(eventSiteId, userIds, date, createdById);
  await pruneVisitsFor(eventSiteId, existing.date, userIds, [existing.id]);
}

const linkedEventSelect = {
  id: true,
  siteId: true,
  date: true,
  source: true,
  reportId: true,
  participants: { select: { userId: true } },
} as const;

/**
 * 日報との結び付きを外す。この日報から作った予定（PROCESS）は消し（参加者の現場入りも片づける）、
 * 既にあった予定へ結び付けていたもの（手動の予定）は予定を残して結び付きだけ外す。
 * keepEventId は外さずに残す予定。
 */
export async function detachReportEvents(reportId: string, keepEventId?: string): Promise<void> {
  const notKeep = keepEventId ? { id: { not: keepEventId } } : {};
  const drops = await db.calendarEvent.findMany({
    where: { reportId, source: "PROCESS", ...notKeep },
    select: { id: true, siteId: true, date: true, participants: { select: { userId: true } } },
  });
  if (drops.length > 0) {
    await db.calendarEvent.deleteMany({ where: { id: { in: drops.map((e) => e.id) } } });
    for (const e of drops) {
      if (!e.siteId) continue;
      await pruneVisitsFor(e.siteId, e.date, e.participants.map((p) => p.userId), [e.id]);
    }
  }
  await db.calendarEvent.updateMany({
    where: { reportId, source: { not: "PROCESS" }, ...notKeep },
    data: { reportId: null },
  });
}

/**
 * 既にある予定（target）をこの日報の次回作業日にする。前にこの日報から作っていた予定の参加者は
 * target へ寄せてから外す。人が入れた予定・人がまとめた予定なので、日報を消しても予定は残るよう
 * 手動の予定（MANUAL）として扱う（別の日報に結び付いていた予定でも、日報削除で消えない）。
 */
async function attachToEvent(
  reportId: string,
  target: LinkedEvent,
  siteId: string,
  date: Date,
  createdById: string,
): Promise<void> {
  const previous = await db.calendarEvent.findMany({
    where: { reportId, id: { not: target.id }, source: "PROCESS" },
    select: { participants: { select: { userId: true } } },
  });
  const have = new Set(target.participants.map((p) => p.userId));
  const add = [...new Set(previous.flatMap((e) => e.participants.map((p) => p.userId)))].filter(
    (u) => !have.has(u),
  );
  if (add.length > 0) {
    await db.eventParticipant.createMany({
      data: add.map((userId) => ({ eventId: target.id, userId })),
    });
  }
  await detachReportEvents(reportId, target.id);
  await db.calendarEvent.update({
    where: { id: target.id },
    data: { reportId, source: "MANUAL" },
  });
  // 別の日報に結び付いていた予定なら、その日報の次回作業日も同じ日付に合わせる
  // （古い日付のまま残ると、その日報を保存し直したときに予定がまた作られてしまう）
  if (target.reportId && target.reportId !== reportId) {
    await db.dailyReport.updateMany({
      where: { id: target.reportId, nextWorkChoice: "DATE" },
      data: { nextWorkDate: date },
    });
  }
  await moveEventDate(
    { ...target, participants: [...target.participants, ...add.map((userId) => ({ userId }))] },
    siteId,
    date,
    createdById,
  );
  // 寄せた参加者の現場入りを新しい日付に作る（日付が同じで moveEventDate が何もしないときも）
  if (add.length > 0) await upsertVisits(target.siteId ?? siteId, add, date, createdById);
}

/**
 * 日報で決まった次回作業日を予定（カレンダー）に入れる。date が null なら外すだけ。
 * この日報に結び付いた予定は誰でもカレンダーで編集できるので、
 * 既にあれば作り直さず日付だけ合わせる（カレンダーで足した参加者・時間を消さない）。
 * linkEventId が渡されたら（近い日に同じ現場の予定があり「同じ工事」と選ばれたとき）、
 * 新しく作らずにその予定を日報に結び付けて日付を合わせる。
 * 同じ現場・同じ日に作業予定が既にあれば、新しく作らない（二重に入れない）。
 * 新しく作るときは参加者を付けない（配員は今までどおり管理者が組む）。
 */
export async function syncNextWorkEvent(
  reportId: string,
  siteId: string,
  date: Date | null,
  createdById: string,
  linkEventId?: string | null,
): Promise<void> {
  if (!date) {
    await detachReportEvents(reportId);
    return;
  }
  if (linkEventId) {
    const target = await db.calendarEvent.findFirst({
      where: { id: linkEventId, siteId, ...linkableWhere },
      select: linkedEventSelect,
    });
    if (target) {
      await attachToEvent(reportId, target, siteId, date, createdById);
      return;
    }
  }
  const existing = await db.calendarEvent.findFirst({
    where: { reportId, source: { in: LINKABLE_SOURCES } },
    select: linkedEventSelect,
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    await moveEventDate(existing, siteId, date, createdById);
    return;
  }
  // 同じ現場・同じ日に作業予定が既にある（手動で入っている／別の日報で入った）なら作らない。
  // 結び付けるのは「同じ工事」と選ばれたとき（linkEventId）だけ。ここでは勝手に結び付けない。
  const sameDay = await db.calendarEvent.findFirst({
    where: { siteId, date, ...linkableWhere },
    select: { id: true },
  });
  if (sameDay) return;
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

/** 日報の次回作業日の予定を、近い日の予定と「どちらも正しい（別の工事）」として記録する */
export async function markReportEventNotDuplicate(reportId: string, otherIds: string[]): Promise<void> {
  if (otherIds.length === 0) return;
  const ev = await db.calendarEvent.findFirst({
    where: { reportId, source: { in: LINKABLE_SOURCES } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (ev) await recordNotDuplicate(ev.id, otherIds);
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
