"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, isSuperAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { validateAvatarDataUrl } from "@/lib/photos";
import { DEFAULT_AVATAR_COLOR } from "@/lib/constants";

export type UserFormState = { error?: string; ok?: boolean };

function nz(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
}

const baseShape = {
  name: z.string().min(1, "氏名を入力してください"),
  email: z.string().email("メールアドレスの形式が正しくありません"),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "STAFF"]),
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
  const me = await requireAdmin();
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

  // 最高管理者の付与は最高管理者のみ
  if (d.role === "SUPER_ADMIN" && !isSuperAdmin(me)) {
    return { error: "最高管理者を付与できるのは最高管理者のみです" };
  }

  const avatarResult = validateAvatarDataUrl(formData.get("avatarImage")?.toString());
  if (avatarResult && typeof avatarResult === "object") return { error: avatarResult.error };
  const avatarImage = avatarResult as string | null;

  const exists = await db.user.findUnique({ where: { email: d.email } });
  if (exists) return { error: "このメールアドレスは既に登録されています" };

  await db.user.create({
    data: {
      name: d.name,
      email: d.email,
      role: d.role,
      department: d.department ?? null,
      avatarColor: d.avatarColor ?? DEFAULT_AVATAR_COLOR,
      avatarImage,
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
  const me = await requireAdmin();
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

  // 最高管理者の付与・変更は最高管理者のみ（対象が最高管理者の場合も編集不可）
  if (!isSuperAdmin(me)) {
    if (target.role === "SUPER_ADMIN") {
      return { error: "最高管理者の情報を変更できるのは最高管理者のみです" };
    }
    if (d.role === "SUPER_ADMIN") {
      return { error: "最高管理者を付与できるのは最高管理者のみです" };
    }
  }

  if (d.email !== target.email) {
    const dup = await db.user.findUnique({ where: { email: d.email } });
    if (dup && dup.id !== d.id) {
      return { error: "このメールアドレスは既に使われています" };
    }
  }

  // 最高管理者を降格して最高管理者が0人にならないか
  if (target.role === "SUPER_ADMIN" && d.role !== "SUPER_ADMIN") {
    const superCount = await db.user.count({ where: { role: "SUPER_ADMIN", active: true } });
    if (superCount <= 1) {
      return { error: "最高管理者が0人になるため、この変更はできません" };
    }
  }

  // 管理者を減らす変更（降格）で管理者（最高管理者を含む）が0人にならないか
  if (target.role === "ADMIN" && d.role !== "ADMIN") {
    const adminCount = await db.user.count({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, active: true },
    });
    if (adminCount <= 1) {
      return { error: "管理者が0人になるため、この変更はできません" };
    }
  }

  const avatarResult = validateAvatarDataUrl(formData.get("avatarImage")?.toString());
  if (avatarResult && typeof avatarResult === "object") return { error: avatarResult.error };
  const avatarImage = avatarResult as string | null;

  const passwordHash = d.password ? await hashPassword(d.password) : undefined;

  await db.user.update({
    where: { id: d.id },
    data: {
      name: d.name,
      email: d.email,
      role: d.role,
      department: d.department ?? null,
      avatarColor: d.avatarColor ?? target.avatarColor,
      avatarImage,
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

  // 最高管理者を無効化できるのは最高管理者のみ
  if (target.role === "SUPER_ADMIN" && !isSuperAdmin(me)) {
    return { error: "最高管理者を無効化できるのは最高管理者のみです" };
  }

  if (target.active) {
    if (target.id === me.id) return { error: "自分自身は無効化できません" };
    if (target.role === "SUPER_ADMIN") {
      const activeSupers = await db.user.count({ where: { role: "SUPER_ADMIN", active: true } });
      if (activeSupers <= 1) return { error: "最後の最高管理者は無効化できません" };
    }
    if (target.role === "ADMIN") {
      const activeAdmins = await db.user.count({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, active: true },
      });
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

  // 最高管理者を削除できるのは最高管理者のみ
  if (target.role === "SUPER_ADMIN" && !isSuperAdmin(me)) {
    return { error: "最高管理者を削除できるのは最高管理者のみです" };
  }

  if (target.role === "SUPER_ADMIN") {
    const supers = await db.user.count({ where: { role: "SUPER_ADMIN" } });
    if (supers <= 1) return { error: "最後の最高管理者は削除できません" };
  }

  if (target.role === "ADMIN") {
    const admins = await db.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
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
