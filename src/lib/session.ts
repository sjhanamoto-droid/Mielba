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

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export function isAdmin(user: { role: string } | null): boolean {
  return user?.role === "ADMIN";
}
