"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { jstDateKey, todayRange } from "@/lib/date";
import { createNotification } from "@/lib/notifications";
import { isAdmin, requireUser } from "@/lib/session";

// 引き継ぎ事項（Handover）のサーバーアクション。
// 日報提出時に起票され、当日その現場に入る人が一人ずつ読んで「確認しました」を押す（HandoverRead）。
// 確認しても他の人の画面からは消えない。対応が終わったら起票者か管理者が「対応完了」で閉じる。
// 誤って閉じても「対応中に戻す」で元に戻せる（reopenHandover）。

export interface HandoverReader {
  name: string;
  readAt: Date;
}

export interface OpenHandover {
  id: string;
  content: string;
  createdAt: Date;
  createdByName?: string;
  /** 確認した人（確認順） */
  readers: HandoverReader[];
  /** 今日この現場に入るのに、まだ確認していない人 */
  unreadNames: string[];
  /** 見ている本人が確認済みか（自分で書いたものは確認済み扱い） */
  readByMe: boolean;
  /** 見ている本人が「対応完了」にできるか（起票者・管理者） */
  canClose: boolean;
}

export interface ResolvedHandover {
  id: string;
  content: string;
  createdAt: Date;
  createdByName?: string;
  resolvedAt: Date;
  resolvedByName?: string;
}

/** id の集合 → ユーザー名の Map（createdById/resolvedById は緩い String? のため個別に解決する） */
async function nameMapFor(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  if (unique.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** 今日その現場に入る人の userId（配員＝SiteVisit） */
async function todayVisitorIds(siteId: string): Promise<string[]> {
  const visits = await db.siteVisit.findMany({
    where: { siteId, date: todayRange() },
    select: { userId: true },
  });
  return Array.from(new Set(visits.map((v) => v.userId)));
}

/** 現場の対応中（未完了）の引き継ぎ事項を、確認状況つきで取得する */
export async function getOpenHandovers(
  siteId: string,
  viewer: { id: string; role: string },
): Promise<OpenHandover[]> {
  const [handovers, visitorIds] = await Promise.all([
    db.handover.findMany({
      where: { siteId, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        createdAt: true,
        createdById: true,
        reads: { orderBy: { readAt: "asc" }, select: { userId: true, readAt: true } },
      },
    }),
    todayVisitorIds(siteId),
  ]);
  if (handovers.length === 0) return [];

  const nameById = await nameMapFor([
    ...handovers.flatMap((h) => [h.createdById, ...h.reads.map((r) => r.userId)]),
    ...visitorIds,
  ]);
  const admin = isAdmin(viewer);

  return handovers.map((h) => {
    const readIds = new Set(h.reads.map((r) => r.userId));
    const mine = !!h.createdById && h.createdById === viewer.id;
    return {
      id: h.id,
      content: h.content,
      createdAt: h.createdAt,
      createdByName: h.createdById ? nameById.get(h.createdById) : undefined,
      readers: h.reads.map((r) => ({
        name: nameById.get(r.userId) ?? "（退職者）",
        readAt: r.readAt,
      })),
      // 書いた本人は読む必要がないので未確認に数えない
      unreadNames: visitorIds
        .filter((id) => id !== h.createdById && !readIds.has(id))
        .map((id) => nameById.get(id) ?? "（不明）"),
      readByMe: mine || readIds.has(viewer.id),
      canClose: mine || admin,
    };
  });
}

/**
 * 現場の「対応完了」の引き継ぎ事項を新しい順に取得する。
 * 閉じたあとでも読み返せるように、現場詳細で履歴として表示する。
 */
export async function getResolvedHandovers(
  siteId: string,
  take = 30,
): Promise<ResolvedHandover[]> {
  const handovers = await db.handover.findMany({
    where: { siteId, resolvedAt: { not: null } },
    orderBy: { resolvedAt: "desc" },
    take,
    select: {
      id: true,
      content: true,
      createdAt: true,
      createdById: true,
      resolvedAt: true,
      resolvedById: true,
    },
  });
  if (handovers.length === 0) return [];

  const nameById = await nameMapFor(
    handovers.flatMap((h) => [h.createdById, h.resolvedById]),
  );

  return handovers.map((h) => ({
    id: h.id,
    content: h.content,
    createdAt: h.createdAt,
    createdByName: h.createdById ? nameById.get(h.createdById) : undefined,
    // where 句で not null に絞っているが、型上は nullable なのでフォールバックを置く
    resolvedAt: h.resolvedAt ?? h.createdAt,
    resolvedByName: h.resolvedById ? nameById.get(h.resolvedById) : undefined,
  }));
}

function revalidateHandover(siteId: string) {
  // 強制ゲート（layout）の対象も変わるので layout ごと再計算する
  revalidatePath("/", "layout");
  revalidatePath("/reports");
  revalidatePath(`/sites/${siteId}`);
}

/**
 * 本人が引き継ぎを読んで「確認しました」を記録する。
 * 今日の配員が全員確認し終えたら、起票者に知らせる。
 */
export async function markHandoverRead(handoverId: string) {
  const user = await requireUser();

  const handover = await db.handover.findUnique({
    where: { id: handoverId },
    select: { id: true, siteId: true, createdById: true, site: { select: { name: true } } },
  });
  if (!handover) {
    // 表示中に日報ごと取り下げられた等。ゲートが詰まらないよう、確認済みと同じく先へ進める
    revalidatePath("/", "layout");
    return { ok: true };
  }

  // 多重タップでも1件にする
  await db.handoverRead.upsert({
    where: { handoverId_userId: { handoverId, userId: user.id } },
    create: { handoverId, userId: user.id },
    update: {},
  });

  const dayKey = jstDateKey();
  try {
    const [visitorIds, reads, unreadLeft] = await Promise.all([
      todayVisitorIds(handover.siteId),
      db.handoverRead.findMany({ where: { handoverId }, select: { userId: true } }),
      // この現場で本人がまだ確認していない引き継ぎ（朝の「未確認」通知を片付けるため）
      db.handover.count({
        where: {
          siteId: handover.siteId,
          resolvedAt: null,
          OR: [{ createdById: null }, { createdById: { not: user.id } }],
          reads: { none: { userId: user.id } },
        },
      }),
    ]);

    // 全部読んだら、朝の「未確認の引き継ぎがあります」通知を既読にする（起動ゲートに残さない）
    if (unreadLeft === 0) {
      await db.notification.updateMany({
        where: { userId: user.id, dedupeKey: `handover-unread-${handover.siteId}-${dayKey}`, read: false },
        data: { read: true },
      });
    }

    // 今日の配員（起票者を除く）が全員確認したら、起票者へ知らせる（日ごとに1回）。
    // 今日の配員でない人が読んだだけでは知らせない
    const readIds = new Set(reads.map((r) => r.userId));
    const targets = visitorIds.filter((id) => id !== handover.createdById);
    if (
      handover.createdById &&
      handover.createdById !== user.id &&
      targets.includes(user.id) &&
      targets.every((id) => readIds.has(id))
    ) {
      await createNotification({
        userId: handover.createdById,
        type: "HANDOVER_ALL_READ",
        title: "引き継ぎを全員が確認しました",
        body: `${handover.site.name}：今日の担当${targets.length}名が確認済みです`,
        href: `/sites/${handover.siteId}`,
        siteId: handover.siteId,
        dedupeKey: `handover-allread-${handoverId}-${dayKey}`,
      });
    }
  } catch (err) {
    // 通知に失敗しても確認の記録は成功扱い
    console.error("[handovers] 確認後の通知処理に失敗しました", err);
  }

  revalidateHandover(handover.siteId);
  return { ok: true };
}

/** 引き継ぎを「対応完了」にして閉じる（起票者か管理者のみ） */
export async function closeHandover(handoverId: string) {
  const user = await requireUser();

  const handover = await db.handover.findUnique({
    where: { id: handoverId },
    select: { id: true, siteId: true, createdById: true, resolvedAt: true },
  });
  if (!handover) {
    return { error: "引き継ぎ事項が見つかりません。" };
  }
  if (handover.createdById !== user.id && !isAdmin(user)) {
    return { error: "対応完了にできるのは、書いた人か管理者だけです。" };
  }
  if (handover.resolvedAt) {
    return { ok: true }; // すでに完了（多重クリック等）
  }

  await db.handover.update({
    where: { id: handoverId },
    data: { resolvedAt: new Date(), resolvedById: user.id },
  });

  revalidateHandover(handover.siteId);
  return { ok: true };
}

/**
 * 「対応完了」を取り消して対応中に戻す。
 * 誤って閉じた引き継ぎを復帰させるための操作なので、ログイン済みなら誰でも実行できる。
 */
export async function reopenHandover(handoverId: string) {
  await requireUser();

  const handover = await db.handover.findUnique({
    where: { id: handoverId },
    select: { id: true, siteId: true, resolvedAt: true },
  });
  if (!handover) {
    return { error: "引き継ぎ事項が見つかりません。" };
  }
  if (!handover.resolvedAt) {
    return { ok: true }; // すでに対応中（多重クリック等）
  }

  await db.handover.update({
    where: { id: handoverId },
    data: { resolvedAt: null, resolvedById: null },
  });

  revalidateHandover(handover.siteId);
  return { ok: true };
}
