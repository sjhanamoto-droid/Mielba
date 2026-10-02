import { db } from "@/lib/db";
import { todayRange } from "@/lib/date";

// 引き継ぎの強制ゲート用：今日その現場に入る人が、まだ読んでいない引き継ぎを集める。

// ゲートで読ませるのは直近この日数に書かれた引き継ぎだけ。
// 閉じ忘れの古い引き継ぎで毎回足止めされないようにする（古いものも現場詳細には残る）。
export const HANDOVER_GATE_DAYS = 14;

/** ゲート対象になる引き継ぎの作成日時の下限 */
export function handoverGateSince(): Date {
  return new Date(Date.now() - HANDOVER_GATE_DAYS * 24 * 60 * 60 * 1000);
}

export type PendingHandover = {
  id: string;
  siteId: string;
  siteName: string;
  content: string;
  createdAt: Date;
  createdByName?: string;
};

/**
 * 指定ユーザーの今日の現場入り(SiteVisit)の現場について、
 * 対応中（未完了）で本人がまだ確認していない引き継ぎを古い順に返す。
 * 自分が書いた引き継ぎと、HANDOVER_GATE_DAYS より古い引き継ぎは読ませない。
 */
export async function getPendingHandovers(userId: string): Promise<PendingHandover[]> {
  const visits = await db.siteVisit.findMany({
    where: { userId, date: todayRange() },
    select: { siteId: true },
  });
  if (visits.length === 0) return [];

  const handovers = await db.handover.findMany({
    where: {
      siteId: { in: visits.map((v) => v.siteId) },
      resolvedAt: null,
      createdAt: { gte: handoverGateSince() },
      // createdById は null がありうるため not だけだと null が落ちる
      OR: [{ createdById: null }, { createdById: { not: userId } }],
      reads: { none: { userId } },
    },
    // 古いものから順に読ませる（申し送りの流れどおり）
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      siteId: true,
      content: true,
      createdAt: true,
      createdById: true,
      site: { select: { name: true } },
    },
  });
  if (handovers.length === 0) return [];

  const creatorIds = Array.from(
    new Set(handovers.map((h) => h.createdById).filter((v): v is string => !!v)),
  );
  const creators = creatorIds.length
    ? await db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(creators.map((u) => [u.id, u.name]));

  return handovers.map((h) => ({
    id: h.id,
    siteId: h.siteId,
    siteName: h.site.name,
    content: h.content,
    createdAt: h.createdAt,
    createdByName: h.createdById ? nameById.get(h.createdById) : undefined,
  }));
}
