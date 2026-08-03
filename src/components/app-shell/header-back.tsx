"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * ページ上部の「戻る」ボタン。
 * 遷移元に関わらず「元の画面」に戻れるよう、アプリ内の履歴があれば
 * ブラウザの戻る（router.back）を使う。履歴が無い直リンク/通知起動などの
 * ときだけ、固定の fallbackHref へ遷移する。
 */
export function HeaderBack({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="戻る"
      className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-sunken active:bg-surface-sunken"
    >
      <ChevronLeft className="h-6 w-6" />
    </button>
  );
}
