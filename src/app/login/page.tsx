import type { Metadata } from "next";
import { HardHat } from "lucide-react";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "ログイン | Mielba" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-gradient-to-b from-brand-700 to-brand-900 px-5 py-10 safe-top safe-bottom">
      <div className="app-container flex min-h-[calc(100dvh-5rem)] flex-col">
        {/* ブランド */}
        <div className="flex flex-1 flex-col items-center justify-center pb-6">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <HardHat className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Mielba</h1>
          <p className="mt-1 text-sm font-medium text-brand-100">
            建設業の現場を、見える化する。
          </p>
        </div>

        {/* ログインカード */}
        <div className="rounded-3xl bg-surface p-6 shadow-float">
          <h2 className="mb-1 text-lg font-bold text-ink">ログイン</h2>
          <p className="mb-5 text-sm text-ink-muted">アカウント情報を入力してください</p>
          <LoginForm />

          <div className="mt-6 rounded-xl bg-surface-subtle p-3 text-xs leading-relaxed text-ink-muted">
            <p className="mb-1 font-semibold text-ink-soft">デモ用アカウント</p>
            <p>管理者：admin@mielba.app</p>
            <p>スタッフ：sato@mielba.app</p>
            <p>パスワード（共通）：mielba123</p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-brand-200/80">
          © 2026 Mielba — 建設業向け現場管理アプリ v0.3
        </p>
      </div>
    </main>
  );
}
