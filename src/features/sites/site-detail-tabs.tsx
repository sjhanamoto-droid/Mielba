"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// 現場詳細のページ内タブ。
// 現場を開いたら「連絡・メモ」だけが目に入り、基本情報は上部タブか横スワイプで切り替える。
// パネルは全て描画したまま表示だけ切り替えるので、書きかけのメモや開閉状態が消えない。

export type SiteDetailTab = {
  id: string;
  label: string;
  /** バッジの数字（0 や未指定なら非表示） */
  count?: number;
  /** バッジを注意色にする（未確認の引き継ぎがあるときなど） */
  alert?: boolean;
  content: ReactNode;
};

/** スワイプを無視する要素（横スクロールする表や入力欄の中では切り替えない） */
const SWIPE_BLOCK = "[data-noswipe], .overflow-x-auto, input, textarea, select";

export function SiteDetailTabs({
  tabs,
  defaultId,
}: {
  tabs: SiteDetailTab[];
  defaultId?: string;
}) {
  const baseId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number; ok: boolean } | null>(null);
  const [activeId, setActiveId] = useState<string>(
    defaultId && tabs.some((t) => t.id === defaultId) ? defaultId : (tabs[0]?.id ?? ""),
  );
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  if (!active) return null;

  /** タブを切り替える。下までスクロールしていたらタブバーの位置まで戻す */
  function select(id: string, focus = false) {
    setActiveId(id);
    if (focus) document.getElementById(`${baseId}-tab-${id}`)?.focus();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const top = wrap.getBoundingClientRect().top;
    if (top < 0) {
      const headerH = document.querySelector("header")?.getBoundingClientRect().height ?? 56;
      window.scrollTo({ top: Math.max(0, window.scrollY + top - headerH) });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((t) => t.id === active.id);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next].id, true);
  }

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    const el = e.target as HTMLElement | null;
    touchRef.current = { x: t.clientX, y: t.clientY, ok: !el?.closest?.(SWIPE_BLOCK) };
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start?.ok) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // 横方向にしっかり動いたときだけ切り替える（縦スクロールと誤認しない）
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const idx = tabs.findIndex((x) => x.id === active.id);
    const next = dx < 0 ? idx + 1 : idx - 1;
    if (next < 0 || next >= tabs.length) return;
    select(tabs[next].id);
  }

  return (
    <div ref={wrapRef}>
      <div className="sticky-under-header border-b border-line bg-surface/95 backdrop-blur-md">
        <div
          role="tablist"
          aria-label="現場詳細の表示切替"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="mx-auto flex w-full max-w-7xl px-2 md:px-6"
        >
          {tabs.map((t) => {
            const selected = t.id === active.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(t.id)}
                className={cn(
                  "relative flex min-h-[48px] flex-1 items-center justify-center gap-1.5 px-2 text-[15px] font-bold transition-colors",
                  selected ? "text-brand-700" : "text-ink-muted hover:text-ink-soft",
                )}
              >
                <span className="truncate">{t.label}</span>
                {t.count ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs font-bold tnum",
                      t.alert
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                        : selected
                          ? "bg-brand-50 text-brand-700"
                          : "bg-surface-sunken text-ink-muted",
                    )}
                  >
                    {t.count}
                  </span>
                ) : null}
                {selected && (
                  <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-brand-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="mx-auto w-full max-w-7xl px-4 py-4 md:px-8 md:py-7"
      >
        {tabs.map((t) => {
          const selected = t.id === active.id;
          return (
            <div
              key={t.id}
              role="tabpanel"
              id={`${baseId}-panel-${t.id}`}
              aria-labelledby={`${baseId}-tab-${t.id}`}
              hidden={!selected}
              className={cn(!selected && "hidden")}
            >
              {t.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
