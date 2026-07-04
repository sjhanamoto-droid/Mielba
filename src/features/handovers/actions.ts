"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// 引き継ぎ事項（Handover）のサーバーアクション。
// 日報提出時に起票され、次の担当者が「確認して停止」で解決する。

export interface OpenHandover {
  id: string;
  content: string;
  createdAt: Date;
  createdByName?: string;
}

/** 現場の未解決の引き継ぎ事項を取得する（起票者名を解決して返す） */
export async function getOpenHandovers(siteId: string): Promise<OpenHandover[]> {
  const handovers = await db.handover.findMany({
    where: { siteId, resolvedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, createdAt: true, createdById: true },
  });
  if (handovers.length === 0) return [];

  // createdById は緩い String? のため、ユーザー名を別途解決する
  const userIds = Array.from(
    new Set(handovers.map((h) => h.createdById).filter((v): v is string => !!v)),
  );
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return handovers.map((h) => ({
    id: h.id,
    content: h.content,
    createdAt: h.createdAt,
    createdByName: h.createdById ? nameById.get(h.createdById) : undefined,
  }));
}

/** 引き継ぎ事項を「確認済み」として停止（解決）する */
export async function resolveHandover(handoverId: string) {
  const user = await requireUser();

  const handover = await db.handover.findUnique({
    where: { id: handoverId },
    select: { id: true, siteId: true, resolvedAt: true },
  });
  if (!handover) {
    return { error: "引き継ぎ事項が見つかりません。" };
  }
  if (handover.resolvedAt) {
    return { ok: true }; // すでに解決済み（多重クリック等）
  }

  await db.handover.update({
    where: { id: handoverId },
    data: { resolvedAt: new Date(), resolvedById: user.id },
  });

  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath(`/sites/${handover.siteId}`);
  return { ok: true };
}
