"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { resolveHandover } from "@/features/handovers/actions";

// 引き継ぎ事項の警告バナー。
// 現場に未解決の引き継ぎがあるとき、日報入力画面や現場詳細の先頭に表示する。
// 各項目の「確認して停止」で resolveHandover を実行し、以降は表示されない。

export interface HandoverAlertItem {
  id: string;
  content: string;
  createdAt: Date | string;
  createdByName?: string;
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function HandoverAlert({ handovers }: { handovers: HandoverAlertItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const visible = handovers.filter((h) => !resolvedIds.has(h.id));
  if (visible.length === 0) return null;

  function handleResolve(id: string) {
    setResolvingId(id);
    startTransition(async () => {
      const result = await resolveHandover(id);
      if (result && "ok" in result && result.ok) {
        setResolvedIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
      setResolvingId(null);
    });
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
        <p className="text-sm font-bold">引き継ぎ事項があります</p>
      </div>
      <ul className="mt-3 space-y-2">
        {visible.map((h) => {
          const resolving = isPending && resolvingId === h.id;
          return (
            <li
              key={h.id}
              className="flex flex-col gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words text-sm text-amber-900 dark:text-amber-100">
                  {h.content}
                </p>
                <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">
                  {formatDate(h.createdAt)}
                  {h.createdByName ? ` ・ ${h.createdByName}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleResolve(h.id)}
                disabled={resolving}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/60"
              >
                {resolving ? (
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
    </div>
  );
}
