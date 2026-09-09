"use client";

import { useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, History, Loader2, RotateCcw } from "lucide-react";
import { resolveHandover, unresolveHandover } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { jstDateTimeLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

// 現場の引き継ぎ事項パネル（未確認＋確認済みの履歴）。
// 「確認して停止」は誤タップしても取り消せるようにし、確認済みも読み返せるよう履歴に残す。

export interface HandoverPanelItem {
  id: string;
  content: string;
  createdAt: Date | string;
  createdByName?: string;
  resolvedAt?: Date | string;
  resolvedByName?: string;
}

const FAIL_MSG = "通信に失敗しました。もう一度お試しください。";

function meta(item: HandoverPanelItem): string {
  const when = jstDateTimeLabel(item.createdAt);
  return item.createdByName ? `${when}・${item.createdByName}` : when;
}

export function HandoverPanel({
  open,
  resolved,
  children,
}: {
  /** 未確認（新しい順） */
  open: HandoverPanelItem[];
  /** 確認済み（新しい順・直近ぶんのみ） */
  resolved: HandoverPanelItem[];
  /** 未確認アラートと確認済み履歴の間に置く内容（現場の常設メモなど） */
  children?: ReactNode;
}) {
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // この画面で操作した引き継ぎ。直後に「戻す」ボタンを見つけられるよう履歴を開いた状態にする
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);

  // 直近に操作した引き継ぎがあるときは、履歴を開いた状態にして「戻す」をすぐ押せるようにする
  const autoOpen = resolved.some((h) => touched.has(h.id));
  const historyOpen = showHistory || autoOpen;

  function run(id: string, fn: () => Promise<{ ok?: boolean; error?: string } | void>) {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && "error" in res && res.error) setError(res.error);
        else setTouched((prev) => new Set(prev).add(id));
      } catch {
        setError(FAIL_MSG);
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-2.5">
      {/* 未確認：現場に入る前に必ず読むもの */}
      {open.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            <p className="text-sm font-bold">未確認の引き継ぎが{open.length}件あります</p>
          </div>
          <ul className="mt-3 space-y-2">
            {open.map((h) => {
              const busy = busyId === h.id;
              return (
                <li
                  key={h.id}
                  className="flex flex-col gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap break-words text-sm text-amber-900 dark:text-amber-100">
                      {h.content}
                    </p>
                    <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">{meta(h)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => run(h.id, () => resolveHandover(h.id))}
                    disabled={busy}
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/60"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden />
                    )}
                    確認して停止
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-300/80">
            停止しても消えません。下の「確認済みの引き継ぎ」からいつでも読み返せます。
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="px-1 text-xs font-semibold text-status-danger">
          {error}
        </p>
      )}

      {children}

      {/* 確認済み：読み返せる・未確認に戻せる */}
      {resolved.length > 0 && (
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => {
              // 自動で開いている状態から閉じる場合も含め、押したら必ず表示が切り替わる
              if (historyOpen) {
                setShowHistory(false);
                setTouched(new Set());
              } else {
                setShowHistory(true);
              }
            }}
            aria-expanded={historyOpen}
            className="flex min-h-[48px] w-full items-center gap-2 px-4 text-sm font-semibold text-ink-soft hover:bg-surface-subtle"
          >
            <History className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            確認済みの引き継ぎ
            <span className="rounded-full bg-surface-sunken px-1.5 text-xs font-bold text-ink-muted tnum">
              {resolved.length}
            </span>
            {historyOpen ? (
              <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            ) : (
              <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            )}
          </button>

          {historyOpen && (
            <ul className="divide-y divide-line border-t border-line">
              {resolved.map((h) => {
                const busy = busyId === h.id;
                return (
                  <li key={h.id} className="px-4 py-3">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
                      {h.content}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {meta(h)}
                      {h.resolvedAt && (
                        <>
                          {" ／ "}
                          {jstDateTimeLabel(h.resolvedAt)} に
                          {h.resolvedByName ? `${h.resolvedByName}が` : ""}確認
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => run(h.id, () => unresolveHandover(h.id))}
                      disabled={busy}
                      className={cn(
                        buttonClass({ variant: "outline", size: "sm", className: "mt-2" }),
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw className="h-4 w-4" aria-hidden />
                      )}
                      未確認に戻す
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
