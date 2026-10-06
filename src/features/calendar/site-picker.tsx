"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronRight, HardHat, MapPin, Search, X } from "lucide-react";
import { SiteStageStepper } from "@/components/site-card";
import { siteStageIndex } from "@/lib/constants";
import { cn } from "@/lib/utils";

// 選択画面のタブ。既定は進行中（開くたびに進行中から）
const TABS = [
  { status: "ACTIVE", label: "進行中" },
  { status: "SURVEY", label: "現調" },
  { status: "PAST", label: "過去" },
] as const;
type TabStatus = (typeof TABS)[number]["status"];

export type PickerSite = {
  id: string;
  name: string;
  address?: string | null;
  customerName?: string | null;
  siteStatus?: string;
  projectStatus?: string;
};

/**
 * 予定フォームの現場選択。プルダウンの代わりに、押すと現場一覧と同じ見た目のカードが
 * 並ぶ全画面の選択画面を開き、カードをタップして選ぶ。検索（現場名・住所・元請）つき。
 * 値は hidden input（name="siteId"）でフォームに送る。
 */
export function SitePicker({
  sites,
  value,
  onChange,
}: {
  sites: PickerSite[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabStatus>("ACTIVE");
  const countOf = (st: TabStatus) => sites.filter((s) => (s.siteStatus ?? "ACTIVE") === st).length;
  const selected = sites.find((s) => s.id === value) ?? null;

  // 開いている間は Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const t = norm(q);
  const inTab = sites.filter((s) => (s.siteStatus ?? "ACTIVE") === tab);
  const filtered = t
    ? inTab.filter((s) =>
        [s.name, s.address ?? "", s.customerName ?? ""].some((v) => norm(v).includes(t)),
      )
    : inTab;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      <input type="hidden" name="siteId" value={value} />
      <button
        id="siteId"
        type="button"
        onClick={() => {
          setTab("ACTIVE");
          setOpen(true);
        }}
        className={cn(
          "flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors active:scale-[0.99]",
          selected
            ? "border-brand-300 bg-brand-50/60 dark:bg-brand-950/30"
            : "border-line-strong bg-surface hover:bg-surface-subtle",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <HardHat className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-base font-bold text-ink">{selected.name}</span>
              {(selected.customerName || selected.address) && (
                <span className="block truncate text-xs text-ink-muted">
                  {[selected.customerName, selected.address].filter(Boolean).join(" ・ ")}
                </span>
              )}
            </>
          ) : (
            <span className="block text-base font-semibold text-ink-muted">現場を選択してください</span>
          )}
        </span>
        <span className="shrink-0 text-sm font-bold text-brand-600">{selected ? "変更" : "選ぶ"}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </button>

      {open &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="現場を選択"
          className="fixed inset-0 z-[60] flex flex-col bg-surface-subtle animate-fade-in"
        >
          {/* ヘッダー＋検索 */}
          <div className="border-b border-line bg-surface px-4 pb-3 pt-3 safe-top">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
              <h2 className="flex-1 text-lg font-bold text-ink">現場を選択</h2>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setOpen(false)}
                className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft active:bg-surface-sunken"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mx-auto mt-2 w-full max-w-6xl">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 focus-within:border-brand-400">
                <Search className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="現場名・住所・元請で検索"
                  aria-label="現場を検索"
                  className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none"
                  onKeyDown={(e) => {
                    // 予定フォームの送信を防ぐ
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
                {q && (
                  <button
                    type="button"
                    aria-label="検索をクリア"
                    onClick={() => setQ("")}
                    className="text-ink-faint"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              {/* 状態タブ（既定は進行中） */}
              <div className="mt-2 flex gap-2" role="tablist" aria-label="現場の状態">
                {TABS.map((tb) => (
                  <button
                    key={tb.status}
                    type="button"
                    role="tab"
                    aria-selected={tab === tb.status}
                    onClick={() => setTab(tb.status)}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors",
                      tab === tb.status
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-line-strong bg-surface text-ink-soft active:bg-surface-sunken",
                    )}
                  >
                    {tb.label}
                    <span className={cn("text-xs tnum", tab === tb.status ? "text-white/80" : "text-ink-faint")}>
                      {countOf(tb.status)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 現場カード（現場一覧と同じ並び・見た目） */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto w-full max-w-6xl">
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-muted">
                  {q
                    ? "該当する現場がありません"
                    : `${TABS.find((tb) => tb.status === tab)?.label}の現場がありません`}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((s) => {
                    const active = s.id === value;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pick(s.id)}
                        aria-pressed={active}
                        className={cn(
                          "card relative p-4 text-left transition-all active:scale-[0.99] md:hover:border-line-strong md:hover:shadow-float",
                          active && "border-brand-500 ring-2 ring-brand-300",
                        )}
                      >
                        {active && (
                          <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
                            <Check className="h-4 w-4" aria-hidden />
                          </span>
                        )}
                        <h3 className="line-clamp-2 break-words pr-8 text-lg font-bold leading-snug text-ink">
                          {s.name}
                        </h3>
                        {s.customerName && (
                          <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
                            <Building2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                            <span className="truncate">{s.customerName}</span>
                          </p>
                        )}
                        {s.address && (
                          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
                            <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                            <span className="truncate">{s.address}</span>
                          </p>
                        )}
                        {s.siteStatus && s.siteStatus !== "SURVEY" && s.projectStatus && (
                          <SiteStageStepper
                            index={siteStageIndex(s.siteStatus, s.projectStatus)}
                            className="mt-3"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
