import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "ログイン | シゲ電気" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-gradient-to-b from-brand-700 to-brand-900 px-5 py-10 safe-top safe-bottom">
      <div className="app-container flex min-h-[calc(100dvh-5rem)] flex-col">
        {/* ブランド */}
        <div className="flex flex-1 flex-col items-center justify-center pb-6">
          <div className="mb-4 h-20 w-20 overflow-hidden rounded-2xl shadow-float ring-1 ring-white/25">
            {/* 未ログインで表示されるページのため、最適化(_next/image)を介さず素の img で確実に表示 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="シゲ電気"
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">シゲ電気</h1>
          <p className="mt-1 text-sm font-medium text-brand-100">
            建設業の現場を、見える化する。
          </p>
        </div>

        {/* ログインカード */}
        <div className="rounded-3xl bg-surface p-6 shadow-float">
          <h2 className="mb-1 text-lg font-bold text-ink">ログイン</h2>
          <p className="mb-5 text-sm text-ink-muted">アカウント情報を入力してください</p>
          <LoginForm />

          {/* パスワードを忘れた場合の常設ヘルプ（デモ認証情報の画面表示は v0.4 で撤去済み） */}
          <div className="mt-6 rounded-xl bg-surface-subtle p-3 text-xs leading-relaxed text-ink-muted">
            <p>
              パスワードを忘れた場合は管理者（事務所）へ連絡してください。
              管理者は 設定 → スタッフ管理 から再設定できます。
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-brand-200/80">
          © 2026 株式会社シゲ電気
        </p>
      </div>
    </main>
  );
}
