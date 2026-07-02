"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { DEFAULT_AVATAR_COLOR } from "@/lib/constants";

export type UserFormState = { error?: string; ok?: boolean };

function nz(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
}

const baseShape = {
  name: z.string().min(1, "氏名を入力してください"),
  email: z.string().email("メールアドレスの形式が正しくありません"),
  role: z.enum(["ADMIN", "STAFF"]),
  department: z.string().optional(),
  avatarColor: z.string().optional(),
};

const createSchema = z.object({
  ...baseShape,
  password: z.string().min(6, "パスワードは6文字以上で設定してください"),
});

const updateSchema = z.object({
  id: z.string().min(1),
  ...baseShape,
  password: z.string().min(6, "パスワードは6文字以上で設定してください").optional(),
});

export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdmin();
  const parsed = createSchema.safeParse({
    name: nz(formData.get("name")),
    email: (formData.get("email") ?? "").toString().trim().toLowerCase(),
    role: formData.get("role") || "STAFF",
    department: nz(formData.get("department")),
    avatarColor: nz(formData.get("avatarColor")) ?? DEFAULT_AVATAR_COLOR,
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;

  const exists = await db.user.findUnique({ where: { email: d.email } });
  if (exists) return { error: "このメールアドレスは既に登録されています" };

  await db.user.create({
    data: {
      name: d.name,
      email: d.email,
      role: d.role,
      department: d.department ?? null,
      avatarColor: d.avatarColor ?? DEFAULT_AVATAR_COLOR,
      passwordHash: await hashPassword(d.password),
    },
  });
  revalidatePath("/settings/staff");
  redirect("/settings/staff");
}

export async function updateUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdmin();
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: nz(formData.get("name")),
    email: (formData.get("email") ?? "").toString().trim().toLowerCase(),
    role: formData.get("role") || "STAFF",
    department: nz(formData.get("department")),
    avatarColor: nz(formData.get("avatarColor")),
    password: nz(formData.get("password")), // 空なら変更しない
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;

  const target = await db.user.findUnique({ where: { id: d.id } });
  if (!target) return { error: "ユーザーが見つかりません" };

  if (d.email !== target.email) {
    const dup = await db.user.findUnique({ where: { email: d.email } });
    if (dup && dup.id !== d.id) {
      return { error: "このメールアドレスは既に使われています" };
    }
  }

  // 管理者を減らす変更（降格）で管理者が0人にならないか
  if (target.role === "ADMIN" && d.role !== "ADMIN") {
    const adminCount = await db.user.count({ where: { role: "ADMIN", active: true } });
    if (adminCount <= 1) {
      return { error: "管理者が0人になるため、この変更はできません" };
    }
  }

  const passwordHash = d.password ? await hashPassword(d.password) : undefined;

  await db.user.update({
    where: { id: d.id },
    data: {
      name: d.name,
      email: d.email,
      role: d.role,
      department: d.department ?? null,
      avatarColor: d.avatarColor ?? target.avatarColor,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });
  revalidatePath("/settings/staff");
  revalidatePath(`/settings/staff/${d.id}/edit`);
  redirect("/settings/staff");
}

// 有効/無効の切替（無効化＝ログイン不可。日報等の記録は保持）
export async function toggleUserActive(id: string): Promise<UserFormState> {
  const me = await requireAdmin();
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { error: "ユーザーが見つかりません" };

  if (target.active) {
    if (target.id === me.id) return { error: "自分自身は無効化できません" };
    if (target.role === "ADMIN") {
      const activeAdmins = await db.user.count({ where: { role: "ADMIN", active: true } });
      if (activeAdmins <= 1) return { error: "最後の管理者は無効化できません" };
    }
  }

  await db.user.update({ where: { id }, data: { active: !target.active } });
  revalidatePath("/settings/staff");
  return { ok: true } as UserFormState;
}

// 完全削除（日報など記録があるユーザーは不可＝無効化を促す）
export async function deleteUser(id: string): Promise<UserFormState> {
  const me = await requireAdmin();
  if (id === me.id) return { error: "自分自身は削除できません" };

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { error: "ユーザーが見つかりません" };

  if (target.role === "ADMIN") {
    const admins = await db.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) return { error: "最後の管理者は削除できません" };
  }

  const reportCount = await db.dailyReport.count({ where: { userId: id } });
  if (reportCount > 0) {
    return {
      error: `日報が${reportCount}件あるため完全削除できません。記録保持のため「無効化」してください。`,
    };
  }

  await db.user.delete({ where: { id } });
  revalidatePath("/settings/staff");
  return { ok: true } as UserFormState;
}
