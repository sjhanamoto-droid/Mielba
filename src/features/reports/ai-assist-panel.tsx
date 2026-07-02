"use client";

import { useState, useTransition } from "react";
import { Sparkles, AlertTriangle, Wand2, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assistReportAction } from "./actions";
import type { AiAssist } from "@/lib/ai";

// 現場詳細・材料/写真の有無は props で受け取り、要約反映は onApply コールバックで
// 親フォームの state を更新する（DOM 直接参照は廃止）。
export function AiAssistPanel({
  detail,
  hasMaterials,
  hasPhotos,
  appliedSummary,
  onApply,
}: {
  detail: string;
  hasMaterials: boolean;
  hasPhotos: boolean;
  appliedSummary: string;
  onApply: (summary: string) => void;
}) {
  const [result, setResult] = useState<AiAssist | null>(null);
  const [pending, startTransition] = useTransition();

  // 反映済み判定は親 state（appliedSummary）と今回の要約が一致するかで行う
  const applied = Boolean(result?.summary) && appliedSummary === result?.summary;

  function runAssist() {
    startTransition(async () => {
      const res = await assistReportAction(detail, hasMaterials, hasPhotos);
      setResult(res);
    });
  }

  function applySummary() {
    if (!result?.summary) return;
    onApply(result.summary);
  }

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-brand-700">
          <Sparkles className="h-4 w-4" />
          AIサポート
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={runAssist}
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              解析中...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              要約・チェック
            </>
          )}
        </Button>
      </div>

      <p className="mt-1.5 text-[11px] text-ink-faint">
        作業内容を要約し、書き漏れ・誤記の候補を提案します。最終確定はご自身で行ってください。
      </p>

      {result && (
        <div className="mt-3 space-y-3">
          {/* 要約 */}
          {result.summary ? (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-semibold text-ink-soft">要約</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {result.summary}
              </p>
              <Button
                type="button"
                variant={applied ? "outline" : "primary"}
                size="sm"
                onClick={applySummary}
                className="mt-2"
                disabled={applied}
              >
                {applied ? (
                  <>
                    <Check className="h-4 w-4" />
                    反映しました
                  </>
                ) : (
                  "要約を反映"
                )}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              要約できる内容がありません。現場詳細を入力してください。
            </p>
          )}

          {/* 誤記補正候補 */}
          {result.corrections.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-semibold text-ink-soft">誤記補正の候補</p>
              <ul className="mt-1.5 space-y-1">
                {result.corrections.map((c, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-sm text-ink">
                    <span className="text-status-danger line-through">{c.from}</span>
                    <span className="text-ink-faint">→</span>
                    <span className="font-semibold text-emerald-600">{c.to}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 書き漏れ警告 */}
          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                書き漏れチェック
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-sm leading-relaxed text-amber-700">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.corrections.length === 0 &&
            result.warnings.length === 0 &&
            result.summary && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" />
                書き漏れ・誤記は見つかりませんでした。
              </p>
            )}
        </div>
      )}
    </div>
  );
}
