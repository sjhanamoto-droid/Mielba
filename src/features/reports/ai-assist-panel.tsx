"use client";

import { useState, useTransition } from "react";
import { Sparkles, Check, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiExtractFields, type AiExtractResult } from "./ai-actions";
import { fmtYen } from "@/lib/utils";

// 現場詳細（aiDraft）を AI が読み取り、作業内容・使用材料・経費・駐車場代・
// 引き継ぎ事項へ「振り分け」る。実行→プレビュー→「この内容を反映」で
// 親フォームの各 state を更新する（反映は onApply コールバック経由）。
// aiEnabled=false（ANTHROPIC_API_KEY なし）のときはボタンを無効化する。
export function AiAssistPanel({
  draft,
  onApply,
  aiEnabled = false,
}: {
  draft: string;
  onApply: (result: AiExtractResult) => void;
  aiEnabled?: boolean;
}) {
  const [result, setResult] = useState<AiExtractResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [pending, startTransition] = useTransition();

  const canRun = aiEnabled && draft.trim() !== "";

  function runExtract() {
    setMessage(null);
    setApplied(false);
    startTransition(async () => {
      const res = await aiExtractFields({ draft });
      if (res.status === "ok") {
        setResult(res.result);
      } else if (res.status === "error") {
        setResult(null);
        setMessage(res.message);
      } else {
        setResult(null);
        setMessage("AIキー未設定、または現場詳細が空のため実行できません。");
      }
    });
  }

  function apply() {
    if (!result) return;
    onApply(result);
    setApplied(true);
  }

  const hasMaterials = result && result.materials.length > 0;
  const hasExpenses = result && result.expenses.length > 0;

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-brand-700">
          <Sparkles className="h-4 w-4" />
          AIサポート
        </span>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={runExtract}
          disabled={pending || !canRun}
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              振り分け中...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              AIで振り分け
            </>
          )}
        </Button>
      </div>

      <p className="mt-1.5 text-[11px] text-ink-faint">
        現場詳細の下書きを読み取り、作業内容・使用材料・経費・駐車場代・引き継ぎ事項へ振り分けます。反映後の内容はご自身で確認してください。
      </p>

      {!aiEnabled && (
        <p className="mt-1 text-[11px] font-medium text-ink-muted">
          AIキー設定後に有効になります。
        </p>
      )}

      {message && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-status-danger">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {message}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          {/* 作業内容 */}
          {result.workContent.trim() && (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-semibold text-ink-soft">作業内容</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {result.workContent}
              </p>
            </div>
          )}

          {/* 使用材料 */}
          {hasMaterials && (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-semibold text-ink-soft">使用材料</p>
              <ul className="mt-1.5 space-y-1">
                {result.materials.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm text-ink">
                    <span className="truncate">{m.name}</span>
                    {(m.quantity || m.unit) && (
                      <span className="shrink-0 tnum text-ink-soft">
                        {m.quantity ?? ""}
                        {m.unit ? ` ${m.unit}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 経費・駐車場代 */}
          {(hasExpenses || result.parkingFee != null) && (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-semibold text-ink-soft">経費</p>
              <ul className="mt-1.5 space-y-1">
                {result.parkingFee != null && (
                  <li className="flex items-center justify-between gap-2 text-sm text-ink">
                    <span className="truncate">駐車場代</span>
                    <span className="shrink-0 tnum text-ink-soft">{fmtYen(result.parkingFee)}</span>
                  </li>
                )}
                {result.expenses.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm text-ink">
                    <span className="truncate">{e.label}</span>
                    <span className="shrink-0 tnum text-ink-soft">{fmtYen(e.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 引き継ぎ事項 */}
          {result.handover.trim() && (
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-semibold text-ink-soft">引き継ぎ事項</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {result.handover}
              </p>
            </div>
          )}

          <Button
            type="button"
            variant={applied ? "outline" : "primary"}
            size="sm"
            onClick={apply}
            disabled={applied}
          >
            {applied ? (
              <>
                <Check className="h-4 w-4" />
                反映しました
              </>
            ) : (
              "この内容を反映"
            )}
          </Button>
          <p className="text-[11px] text-ink-faint">
            ※ 反映すると各項目を上書きします（下書きに無い項目はそのまま残します）。
          </p>
        </div>
      )}
    </div>
  );
}
