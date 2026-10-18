"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { savePayRate, deletePayRate, type PayRateFormState } from "./pay-rate-actions";
import { PayRateFields } from "./pay-rate-fields";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAY_TYPE_LABEL, type PayType } from "@/lib/constants";

export type PayRateRow = {
  id: string;
  payType: string;
  payAmount: number | null;
  socialInsurance: number | null;
  bonusMonthly: number | null;
  otherCost: number | null;
  effectiveFromKey: string; // 'YYYY-MM-DD'
};

/** 今月の見込み（月給のみ）：月の人件費 ÷ 今月の稼働日数 */
export type MonthEstimate = { monthLabel: string; monthlyTotal: number; workDays: number };

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

// 月給は月単位で適用（その月の1日で保存）なので「2026年10月」と出す
function fromLabel(r: PayRateRow): string {
  if (r.payType !== "MONTHLY") return r.effectiveFromKey;
  const [y, m] = r.effectiveFromKey.split("-").map(Number);
  return `${y}年${m}月`;
}

function rateSummary(r: PayRateRow): string {
  if (r.payAmount == null) return "金額未登録";
  if (r.payType !== "MONTHLY") return yen(r.payAmount);
  const total = r.payAmount + (r.socialInsurance ?? 0) + (r.bonusMonthly ?? 0) + (r.otherCost ?? 0);
  const parts = [`基本給 ${yen(r.payAmount)}`];
  if (r.socialInsurance) parts.push(`社保 ${yen(r.socialInsurance)}`);
  if (r.bonusMonthly) parts.push(`賞与 ${yen(r.bonusMonthly)}`);
  if (r.otherCost) parts.push(`その他 ${yen(r.otherCost)}`);
  return `月額 ${yen(total)}（${parts.join("・")}）`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ className: "w-full" })}>
      {pending ? "保存中..." : <><Plus className="h-4 w-4" /> 単価を登録</>}
    </button>
  );
}

// 給与・原価単価の履歴（新しい順）と追加フォーム。最高管理者のみ表示する。
export function PayRateManager({
  userId,
  role,
  rates,
  currentId,
  todayKey,
  estimate,
}: {
  userId: string;
  role: string;
  rates: PayRateRow[];
  /** 今日時点で有効な行の id */
  currentId: string | null;
  todayKey: string;
  estimate: MonthEstimate | null;
}) {
  const [state, formAction] = useActionState<PayRateFormState, FormData>(savePayRate, {});
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // 保存できたら入力欄を作り直して空にする（月額合計の表示も state で持っているため reset では消えない）
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state.ok) setFormKey((k) => k + 1);
  }, [state]);

  function onDelete(r: PayRateRow) {
    setErr(null);
    if (!window.confirm(`${fromLabel(r)} から適用の単価を削除します。この期間の原価は1つ前の単価で計算されます。よろしいですか？`)) return;
    start(async () => {
      const res = await deletePayRate(r.id);
      if (res?.error) setErr(res.error);
    });
  }

  return (
    <div className="space-y-5">
      {estimate && (
        <div className="rounded-xl bg-brand-50 px-3 py-3 text-sm">
          <p className="font-bold text-ink">{estimate.monthLabel}の見込み</p>
          <p className="mt-0.5 text-ink-muted tnum">
            月の人件費 {yen(estimate.monthlyTotal)} ÷ 稼働 {estimate.workDays}日 ＝{" "}
            <span className="font-bold text-ink">
              {estimate.workDays > 0 ? `${yen(Math.round(estimate.monthlyTotal / estimate.workDays))}／人工` : "—（稼働なし）"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">月の途中は稼働日数が増えるたびに変わります。</p>
        </div>
      )}
      {rates.length === 0 ? (
        <p className="rounded-xl bg-surface-sunken px-3 py-3 text-sm text-ink-muted">
          まだ単価が登録されていません。
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {rates.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-ink tnum">{fromLabel(r)} 〜</span>
                  {r.id === currentId && <Badge tone="brand">適用中</Badge>}
                  {r.effectiveFromKey > todayKey && <Badge tone="info">予定</Badge>}
                  <span className="text-xs text-ink-muted">{PAY_TYPE_LABEL[r.payType as PayType] ?? r.payType}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-muted tnum">{rateSummary(r)}</p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(r)}
                disabled={pending}
                aria-label="この単価を削除"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-faint transition-colors hover:bg-red-50 hover:text-status-danger disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="text-sm font-medium text-status-danger">{err}</p>}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={userId} />
        <p className="text-sm font-bold text-ink">
          {rates.length === 0 ? "単価を登録" : "新しい単価を追加（昇給・単価変更）"}
        </p>
        <PayRateFields key={formKey} role={role} todayKey={todayKey} />
        <p className="text-xs text-ink-muted">
          ※ 同じ適用開始日（月給は同じ月）で登録すると、その単価を上書きします。
        </p>
        {state.error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {state.error}
          </div>
        )}
        {state.ok && !state.error && (
          <p className="text-sm font-medium text-emerald-700">単価を保存しました。</p>
        )}
        <SubmitButton />
      </form>
    </div>
  );
}
