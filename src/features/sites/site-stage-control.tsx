"use client";

import { useState, useTransition } from "react";
import { SITE_STAGES, siteStageIndex } from "@/lib/constants";
import { setSiteStage } from "./actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// 進捗ステータスを管理者が手動でタップして変更する（現調→見積り→受注→施工中→完了）。
// タップした段階に応じて siteStatus + projectStatus を更新する。楽観更新＋失敗時ロールバック。
export function SiteStageControl({
  siteId,
  siteStatus,
  projectStatus,
}: {
  siteId: string;
  siteStatus: string;
  projectStatus: string;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const serverIndex = siteStageIndex(siteStatus, projectStatus);
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const current = optimistic ?? serverIndex;

  function select(i: number) {
    if (i === current || pending) return;
    setOptimistic(i);
    start(async () => {
      const r = await setSiteStage(siteId, i);
      if (r?.error) {
        toast(r.error, { type: "error" });
        setOptimistic(null); // 失敗時は元に戻す
      }
      // 成功時は revalidate で props(serverIndex) が更新され、optimistic と一致する
    });
  }

  return (
    <div className={cn(pending && "opacity-70")}>
      <div className="flex items-stretch gap-1">
        {SITE_STAGES.map((label, i) => {
          const active = i === current;
          return (
            <button
              key={label}
              type="button"
              onClick={() => select(i)}
              disabled={pending}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex-1 rounded-md px-1 py-2 text-center text-[11px] font-bold leading-none tracking-tight whitespace-nowrap transition-colors active:scale-[0.97]",
                active
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-surface-sunken text-ink-faint hover:bg-surface-sunken/70",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">
        タップして進捗を変更できます（管理者）。「完了」にすると現場は「過去」になります。
      </p>
    </div>
  );
}
