"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";

export type SettingsState = { error?: string; ok?: boolean };

function nz(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── アプリ設定・会社情報（管理者のみ） ──
const appSchema = z.object({
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  invoiceNumber: z.string().optional(),
  defaultStartTime: z.string().regex(timeRe, "開始時刻の形式が正しくありません（例 08:00）"),
  defaultEndTime: z.string().regex(timeRe, "終了時刻の形式が正しくありません（例 17:00）"),
});

export async function updateAppSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin();
  const parsed = appSchema.safeParse({
    companyName: nz(formData.get("companyName")),
    companyAddress: nz(formData.get("companyAddress")),
    companyPhone: nz(formData.get("companyPhone")),
    invoiceNumber: nz(formData.get("invoiceNumber")),
    defaultStartTime: formData.get("defaultStartTime") || "08:00",
    defaultEndTime: formData.get("defaultEndTime") || "17:00",
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;

  await db.appSetting.upsert({
    where: { id: "singleton" },
    update: {
      companyName: d.companyName ?? null,
      companyAddress: d.companyAddress ?? null,
      companyPhone: d.companyPhone ?? null,
      invoiceNumber: d.invoiceNumber ?? null,
      defaultStartTime: d.defaultStartTime,
      defaultEndTime: d.defaultEndTime,
    },
    create: {
      id: "singleton",
      companyName: d.companyName ?? null,
      companyAddress: d.companyAddress ?? null,
      companyPhone: d.companyPhone ?? null,
      invoiceNumber: d.invoiceNumber ?? null,
      defaultStartTime: d.defaultStartTime,
      defaultEndTime: d.defaultEndTime,
    },
  });
  revalidatePath("/settings/app");
  revalidatePath("/settings");
  return { ok: true };
}

// ── 自分のアカウント設定（全ユーザー） ──
const accountSchema = z.object({
  name: z.string().min(1, "氏名を入力してください"),
  department: z.string().optional(),
  avatarColor: z.string().optional(),
});

export async function updateAccount(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const me = await requireUser();
  const parsed = accountSchema.safeParse({
    name: nz(formData.get("name")),
    department: nz(formData.get("department")),
    avatarColor: nz(formData.get("avatarColor")),
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;

  await db.user.update({
    where: { id: me.id },
    data: {
      name: d.name,
      department: d.department ?? null,
      ...(d.avatarColor ? { avatarColor: d.avatarColor } : {}),
    },
  });
  revalidatePath("/settings/account");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── パスワード変更（全ユーザー） ──
const pwSchema = z.object({
  current: z.string().min(1, "現在のパスワードを入力してください"),
  next: z.string().min(6, "新しいパスワードは6文字以上で設定してください"),
});

export async function changePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const me = await requireUser();
  const parsed = pwSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const user = await db.user.findUnique({ where: { id: me.id } });
  if (!user) return { error: "ユーザーが見つかりません" };

  const ok = await verifyPassword(parsed.data.current, user.passwordHash);
  if (!ok) return { error: "現在のパスワードが違います" };

  await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(parsed.data.next) },
  });
  return { ok: true };
}
