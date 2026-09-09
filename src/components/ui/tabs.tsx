"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// シンプルなタブ切替。優先度の低い情報（協力会社・関連現場・将来フェーズ等）を
// 1枚のカードにまとめて畳んでおく用途。タップ領域は 44px 以上を確保する。

export type TabItem = {
  id: string;
  label: ReactNode;
  /** ラベル横に出す件数（0 や未指定なら非表示） */
  count?: number;
  content: ReactNode;
};

export function Tabs({
  tabs,
  defaultId,
  className,
}: {
  tabs: TabItem[];
  defaultId?: string;
  className?: string;
}) {
  const baseId = useId();
  const [activeId, setActiveId] = useState<string>(
    defaultId && tabs.some((t) => t.id === defaultId) ? defaultId : (tabs[0]?.id ?? ""),
  );
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  if (!active) return null;

  // roving tabindex: ← → Home End でタブを移動し、移動先にフォーカスを当てる
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((t) => t.id === active.id);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = tabs[next].id;
    setActiveId(id);
    document.getElementById(`${baseId}-tab-${id}`)?.focus();
  }

  return (
    <div className={cn("card overflow-hidden", className)}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex border-b border-line bg-surface-subtle"
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
              onClick={() => setActiveId(t.id)}
              className={cn(
                "relative flex min-h-[44px] flex-1 items-center justify-center gap-1.5 px-2 text-sm font-semibold transition-colors",
                selected
                  ? "text-brand-700 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-600"
                  : "text-ink-muted hover:text-ink-soft",
              )}
            >
              <span className="truncate">{t.label}</span>
              {t.count ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] font-bold tnum",
                    selected ? "bg-brand-50 text-brand-700" : "bg-surface-sunken text-ink-muted",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${active.id}`}
        aria-labelledby={`${baseId}-tab-${active.id}`}
        className="p-3"
      >
        {active.content}
      </div>
    </div>
  );
}
