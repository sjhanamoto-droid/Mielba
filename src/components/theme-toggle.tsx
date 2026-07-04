"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * テーマ切替（共有契約6）
 * 'ライト / ダーク / 端末に合わせる' の3択セグメントコントロール。
 * - localStorage 'mielba-theme' に 'light' | 'dark' | 'system' を保存
 * - html[data-theme] に解決済みの 'light' / 'dark' を即時反映
 *   （初期反映は layout.tsx のインラインスクリプトが行う）
 * 設定画面へのマウントは設定担当が行う。
 */

type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "mielba-theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "system", label: "端末に合わせる" },
];

function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

export function ThemeToggle({ className }: { className?: string }) {
  // SSR とのハイドレーション不一致を避けるためマウント後に読み込む
  const [pref, setPref] = React.useState<ThemePreference | null>(null);

  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // プライベートモード等で localStorage が使えない場合
    }
    setPref(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  // 「端末に合わせる」選択中は OS 設定の変更に追従する
  React.useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function select(next: ThemePreference) {
    setPref(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 保存できなくても表示は切り替える
    }
    document.documentElement.dataset.theme = resolve(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="画面テーマ"
      className={cn(
        "flex w-full rounded-xl border border-line bg-surface-sunken p-1",
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = pref === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => select(opt.value)}
            className={cn(
              "h-11 flex-1 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
              active
                ? "bg-surface text-ink shadow-card"
                : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
