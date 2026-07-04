"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

// ---- 簡易ログインレート制限（ブルートフォース対策） ----
// 同一メールアドレスで 5 回連続で失敗すると 60 秒間の待機を課す。
// メモリ上の Map なので、サーバレス（Vercel）ではインスタンスごとに独立し
// コールドスタートでリセットされる＝効果は限定的（それでも単一インスタンス内の
// 連続試行は確実に遅くできる）。本格対策は Redis 等の外部ストア移行が必要。
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;
const loginFailures = new Map<string, { count: number; lockedUntil: number }>();

function checkLoginLock(email: string): number {
  const entry = loginFailures.get(email);
  if (!entry) return 0;
  const remain = entry.lockedUntil - Date.now();
  return remain > 0 ? remain : 0;
}

function recordLoginFailure(email: string) {
  const now = Date.now();
  const entry = loginFailures.get(email) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
    entry.count = 0; // ロック明け後はカウントし直し
  }
  loginFailures.set(email, entry);
  // 肥大化防止：エントリが増えすぎたら期限切れ分を掃除
  if (loginFailures.size > 1000) {
    for (const [key, value] of loginFailures) {
      if (value.lockedUntil < now && value.count === 0) loginFailures.delete(key);
    }
  }
}

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "入力エラー" };
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const lockRemainMs = checkLoginLock(normalizedEmail);
  if (lockRemainMs > 0) {
    const sec = Math.ceil(lockRemainMs / 1000);
    return {
      error: `ログイン失敗が続いたため一時的にロックしています。${sec}秒後にお試しください`,
    };
  }

  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.active) {
    recordLoginFailure(normalizedEmail);
    return { error: "メールアドレスまたはパスワードが違います" };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    recordLoginFailure(normalizedEmail);
    return { error: "メールアドレスまたはパスワードが違います" };
  }

  // 成功したら失敗カウントをリセット
  loginFailures.delete(normalizedEmail);

  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect("/");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
