"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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
  costUnitPrice: number;
  effectiveFromKey: string; // 'YYYY-MM-DD'
};

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

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
}: {
  userId: string;
  role: string;
  rates: PayRateRow[];
  /** 今日時点で有効な行の id */
  currentId: string | null;
  todayKey: string;
}) {
  const [state, formAction] = useActionState<PayRateFormState, FormData>(savePayRate, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  function onDelete(r: PayRateRow) {
    setErr(null);
    if (!window.confirm(`${r.effectiveFromKey} から適用の単価を削除します。この期間の原価は1つ前の単価で計算されます。よろしいですか？`)) return;
    start(async () => {
      const res = await deletePayRate(r.id);
      if (res?.error) setErr(res.error);
    });
  }

  return (
    <div className="space-y-5">
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
                  <span className="text-sm font-bold text-ink tnum">{r.effectiveFromKey} 〜</span>
                  {r.id === currentId && <Badge tone="brand">適用中</Badge>}
                  {r.effectiveFromKey > todayKey && <Badge tone="info">予定</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-ink-muted tnum">
                  原価単価 <span className="font-semibold text-ink">{yen(r.costUnitPrice)}</span>／人工
                  <span className="mx-1.5 text-ink-faint">·</span>
                  {PAY_TYPE_LABEL[r.payType as PayType] ?? r.payType}
                  {r.payAmount != null && ` ${yen(r.payAmount)}`}
                </p>
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

      <form ref={formRef} action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={userId} />
        <p className="text-sm font-bold text-ink">
          {rates.length === 0 ? "単価を登録" : "新しい単価を追加（昇給・単価変更）"}
        </p>
        <PayRateFields role={role} todayKey={todayKey} />
        <p className="text-xs text-ink-muted">
          ※ 同じ適用開始日で登録すると、その日の単価を上書きします。
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
