"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { parsePayRate, upsertPayRate } from "./pay-rate";

// 給与・原価単価（StaffPayRate）。財務情報のため最高管理者のみ。
// 同じ適用開始日で保存し直すと上書き、別の日なら履歴に1行足す（過去の行は触らない）。

export type PayRateFormState = { error?: string; ok?: boolean };

export async function savePayRate(
  _prev: PayRateFormState,
  formData: FormData,
): Promise<PayRateFormState> {
  await requireSuperAdmin();
  const userId = (formData.get("userId") ?? "").toString();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "ユーザーが見つかりません" };

  const { data, error } = parsePayRate(formData);
  if (error) return { error };
  if (!data) return { error: "金額を入力してください" };

  await upsertPayRate(userId, data);
  revalidatePath(`/settings/staff/${userId}/edit`);
  revalidatePath("/settings/staff");
  return { ok: true };
}

export async function deletePayRate(id: string): Promise<PayRateFormState> {
  await requireSuperAdmin();
  const rate = await db.staffPayRate.findUnique({ where: { id }, select: { userId: true } });
  if (!rate) return { error: "単価が見つかりません" };
  await db.staffPayRate.delete({ where: { id } });
  revalidatePath(`/settings/staff/${rate.userId}/edit`);
  revalidatePath("/settings/staff");
  return { ok: true };
}
