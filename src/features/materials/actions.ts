"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// 材料マスタ（MaterialMaster）のサーバーアクション。全て管理者のみ。
// スタッフが日報で選択する材料のリストを管理する。

export type MaterialActionState = { error?: string; ok?: boolean };

const materialSchema = z.object({
  name: z.string().trim().min(1, "材料名を入力してください"),
  unit: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().optional(),
  ),
});

function revalidateMaterials() {
  revalidatePath("/settings");
}

/** 材料を追加する（表示順は末尾） */
export async function createMaterial(formData: FormData): Promise<MaterialActionState> {
  await requireAdmin();
  const parsed = materialSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "入力エラー" };
  }
  try {
    const max = await db.materialMaster.aggregate({ _max: { sortOrder: true } });
    await db.materialMaster.create({
      data: {
        name: parsed.data.name,
        unit: parsed.data.unit ?? null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
  } catch {
    return { error: "材料の追加に失敗しました。時間をおいて再度お試しください" };
  }
  revalidateMaterials();
  return { ok: true };
}

/** 材料の名称・単位を変更する */
export async function updateMaterial(
  id: string,
  formData: FormData,
): Promise<MaterialActionState> {
  await requireAdmin();
  if (!id) return { error: "材料が見つかりません" };
  const parsed = materialSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "入力エラー" };
  }
  try {
    await db.materialMaster.update({
      where: { id },
      data: { name: parsed.data.name, unit: parsed.data.unit ?? null },
    });
  } catch {
    return { error: "材料の更新に失敗しました。時間をおいて再度お試しください" };
  }
  revalidateMaterials();
  return { ok: true };
}

/** 有効/無効を切り替える（無効な材料は日報の選択肢に出さない） */
export async function toggleMaterial(id: string): Promise<MaterialActionState> {
  await requireAdmin();
  if (!id) return { error: "材料が見つかりません" };
  try {
    const material = await db.materialMaster.findUnique({
      where: { id },
      select: { active: true },
    });
    if (!material) return { error: "材料が見つかりません" };
    await db.materialMaster.update({
      where: { id },
      data: { active: !material.active },
    });
  } catch {
    return { error: "材料の切り替えに失敗しました。時間をおいて再度お試しください" };
  }
  revalidateMaterials();
  return { ok: true };
}

/** 材料を削除する（日報での使用実績が無い場合のみ。ある場合は無効化を案内） */
export async function deleteMaterial(id: string): Promise<MaterialActionState> {
  await requireAdmin();
  if (!id) return { error: "材料が見つかりません" };
  try {
    const material = await db.materialMaster.findUnique({
      where: { id },
      select: { name: true },
    });
    if (!material) return { error: "材料が見つかりません" };
    // 材料は日報側に名前で記録されるため、同名の使用実績を確認する
    const usedCount = await db.materialUse.count({ where: { name: material.name } });
    if (usedCount > 0) {
      return {
        error: `「${material.name}」は日報で ${usedCount} 件使用されているため削除できません。「無効」に切り替えてください`,
      };
    }
    await db.materialMaster.delete({ where: { id } });
  } catch {
    return { error: "材料の削除に失敗しました。時間をおいて再度お試しください" };
  }
  revalidateMaterials();
  return { ok: true };
}

/** 表示順を1つ上/下に移動する（全件の sortOrder を位置ベースで振り直す） */
export async function moveMaterial(
  id: string,
  direction: "up" | "down",
): Promise<MaterialActionState> {
  await requireAdmin();
  if (!id) return { error: "材料が見つかりません" };
  try {
    const all = await db.materialMaster.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const index = all.findIndex((m) => m.id === id);
    if (index < 0) return { error: "材料が見つかりません" };
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= all.length) return { ok: true }; // 端では何もしない

    const order = all.map((m) => m.id);
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
    await db.$transaction(
      order.map((materialId, i) =>
        db.materialMaster.update({ where: { id: materialId }, data: { sortOrder: i } }),
      ),
    );
  } catch {
    return { error: "並び順の変更に失敗しました。時間をおいて再度お試しください" };
  }
  revalidateMaterials();
  return { ok: true };
}
