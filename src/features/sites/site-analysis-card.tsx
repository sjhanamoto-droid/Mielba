"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, RefreshCw, TrendingUp, ClipboardCheck } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime, cn } from "@/lib/utils";
import { analyzeSite, type SiteAnalysisType } from "./analysis-actions";

/**
 * 現場のAI分析カード（管理者向け）。
 * - OVERRUN: 人工超過の原因分析（超過中の現場の「人工」セクションに表示）
 * - COMPLETION: 工事完了の振り返り分析（完了＝過去の現場に表示）
 * 実行するとサーバーで日報・現場情報を読み取り分析し、結果は現場に保存される
 * （次回表示時は保存済みの結果を出し、「再分析」で上書きできる）。
 */
export function SiteAnalysisCard({
  siteId,
  type,
  initialAnalysis,
  initialAnalyzedAt,
}: {
  siteId: string;
  type: SiteAnalysisType;
  initialAnalysis: string | null;
  /** ISO文字列（サーバーの保存日時） */
  initialAnalyzedAt: string | null;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [analysis, setAnalysis] = useState<string | null>(initialAnalysis);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(initialAnalyzedAt);

  const isOverrun = type === "OVERRUN";
  const title = isOverrun ? "人工超過のAI分析" : "工事のAI分析（振り返り）";
  const description = isOverrun
    ? "なぜ目標人工を超えたのか、AIが日報と現場情報を読み取って原因の仮説と改善案を提案します。"
    : "この工事の日報・現場情報をすべて読み取り、良かった点・課題・次の工事への提案を分析します。";
  const runLabel = analysis
    ? "再分析する"
    : isOverrun
      ? "AIで原因を分析する"
      : "この工事を分析する";
  const Icon = isOverrun ? TrendingUp : ClipboardCheck;

  function run() {
    if (pending) return;
    startTransition(async () => {
      const res = await analyzeSite(siteId, type);
      if ("error" in res) {
        toast(res.error, { type: "error" });
        return;
      }
      setAnalysis(res.analysis);
      setAnalyzedAt(res.analyzedAt);
      toast("分析が完了しました");
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        isOverrun
          ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20"
          : "border-brand-200 bg-brand-50/60 dark:border-brand-900/50 dark:bg-brand-950/20",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white",
            isOverrun ? "bg-amber-500" : "bg-brand-600",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
            {title}
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          </p>
          <p className="text-[11px] text-ink-muted">管理者のみ表示</p>
        </div>
      </div>

      {analysis ? (
        <>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface p-3.5 text-sm leading-relaxed text-ink">
            {analysis}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-faint">
              分析日時: {analyzedAt ? fmtDateTime(analyzedAt) : "—"}
            </span>
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {pending ? "分析中…" : runLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{description}</p>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className={buttonClass({ variant: "primary", size: "lg", className: "mt-3 w-full" })}
          >
            {pending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {pending ? "AIが日報を読み取って分析中…（30秒ほどかかります）" : runLabel}
          </button>
        </>
      )}
    </div>
  );
}
