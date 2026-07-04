import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "オフライン | Mielba" };

/**
 * オフラインフォールバックページ。
 * Service Worker（public/sw.js）がナビゲーション失敗時にキャッシュ済みの
 * このページを返す。オンライン時に一度表示（またはSWがプリキャッシュ）されると保存される。
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-5 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-sunken">
        <WifiOff className="h-7 w-7 text-ink-muted" />
      </div>
      <h1 className="text-lg font-bold text-ink">オフラインです</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
        電波の良い場所で再読み込みしてください。
        <br />
        入力途中の日報は端末に保存されています。
      </p>
    </div>
  );
}
