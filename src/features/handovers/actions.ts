"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// 引き継ぎ事項（Handover）のサーバーアクション。
// 日報提出時に起票され、次の担当者が「確認して停止」で解決する。
// 誤って停止しても「未確認に戻す」で元に戻せる（unresolveHandover）。

export interface OpenHandover {
  id: string;
  content: string;
  createdAt: Date;
  createdByName?: string;
}

export interface ResolvedHandover extends OpenHandover {
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

/** 現場の未解決の引き継ぎ事項を取得する（起票者名を解決して返す） */
export async function getOpenHandovers(siteId: string): Promise<OpenHandover[]> {
  const handovers = await db.handover.findMany({
    where: { siteId, resolvedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, createdAt: true, createdById: true },
  });
  if (handovers.length === 0) return [];

  const nameById = await nameMapFor(handovers.map((h) => h.createdById));

  return handovers.map((h) => ({
    id: h.id,
    content: h.content,
    createdAt: h.createdAt,
    createdByName: h.createdById ? nameById.get(h.createdById) : undefined,
  }));
}

/**
 * 現場の「確認済み」の引き継ぎ事項を新しい順に取得する。
 * 一度確認したあとでも読み返せるように、現場詳細で履歴として表示する。
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
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath(`/sites/${siteId}`);
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

  revalidateHandover(handover.siteId);
  return { ok: true };
}

/**
 * 「確認して停止」を取り消して未確認に戻す。
 * 誤タップで消えてしまった引き継ぎを復帰させるための操作なので、ログイン済みなら誰でも実行できる。
 */
export async function unresolveHandover(handoverId: string) {
  await requireUser();

  const handover = await db.handover.findUnique({
    where: { id: handoverId },
    select: { id: true, siteId: true, resolvedAt: true },
  });
  if (!handover) {
    return { error: "引き継ぎ事項が見つかりません。" };
  }
  if (!handover.resolvedAt) {
    return { ok: true }; // すでに未確認（多重クリック等）
  }

  await db.handover.update({
    where: { id: handoverId },
    data: { resolvedAt: null, resolvedById: null },
  });

  revalidateHandover(handover.siteId);
  return { ok: true };
}
