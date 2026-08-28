import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { SESSION_COOKIE, verifySession } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  avatarColor: string;
  avatarImage: string | null;
};

// リクエスト単位でキャッシュ（同一レンダリング中の重複クエリを防ぐ）
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySession(token);
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      avatarColor: true,
      avatarImage: true,
      active: true,
    },
  });
  if (!user || !user.active) return null;
  const { active, ...rest } = user;
  void active;
  return rest;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// 管理者権限が必要（最高管理者は管理者権限を内包するため許可）
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/");
  return user;
}

// 最高管理者のみ（原価・会計情報、材料のOCR登録など）
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) redirect("/");
  return user;
}

// 最高管理者は管理者権限を内包する（既存の isAdmin 判定を通す）
export function isAdmin(user: { role: string } | null): boolean {
  return user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
}

export function isSuperAdmin(user: { role: string } | null): boolean {
  return user?.role === "SUPER_ADMIN";
}
