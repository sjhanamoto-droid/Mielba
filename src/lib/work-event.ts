import { db } from "@/lib/db";

// 指定ユーザーを、その現場×日の「作業」予定の参加者から外す（空になった自動予定は掃除）。
export async function removeFromWorkEvent(
  siteId: string,
  userId: string,
  date: Date,
): Promise<void> {
  const event = await db.calendarEvent.findFirst({
    where: { siteId, date, category: "WORK" },
    orderBy: { createdAt: "asc" },
    select: { id: true, note: true, ownerId: true },
  });
  if (!event) return;
  await db.eventParticipant.deleteMany({ where: { eventId: event.id, userId } });
  const remaining = await db.eventParticipant.count({ where: { eventId: event.id } });
  if (remaining === 0) {
    // 自動生成の空予定（メモ無し）は掃除する。手入力のメモがあれば残す。
    if (!event.note) await db.calendarEvent.delete({ where: { id: event.id } });
    return;
  }
  // 所有者が抜けたら、残りの参加者を所有者に繰り上げる
  if (event.ownerId === userId) {
    const next = await db.eventParticipant.findFirst({
      where: { eventId: event.id },
      select: { userId: true },
    });
    if (next) {
      await db.calendarEvent.update({ where: { id: event.id }, data: { ownerId: next.userId } });
    }
  }
}
