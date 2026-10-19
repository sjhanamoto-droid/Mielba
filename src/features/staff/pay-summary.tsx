import { Card } from "@/components/ui/card";
import { rateOn } from "@/lib/pay-rates";
import { monthlyTotal, type UserMonthCost } from "@/lib/labor-cost";
import { PAY_TYPE_LABEL, type PayType } from "@/lib/constants";
import { fmtYen, fmtWorkMinutes } from "@/lib/utils";
import type { RateLike } from "./data";

// 給与の年ごとの比較（「2025年 月給28万 → 2026年 月給30万（＋2万／＋7.1%）」）。
// 各年はその年の年末（今年は今日）時点の給与。履歴（StaffPayRate）から作るので、変更は全部残る。
export function YearlyPay({ rates, today }: { rates: RateLike[]; today: Date }) {
  if (rates.length === 0) return null;
  const firstYear = Math.min(...rates.map((r) => r.effectiveFrom.getFullYear()));
  const thisYear = today.getFullYear();
  const years: { year: number; type: string; amount: number }[] = [];
  for (let y = firstYear; y <= thisYear; y++) {
    const at = y === thisYear ? today : new Date(y, 11, 31);
    const r = rateOn(rates, at);
    if (!r || r.payAmount == null) continue;
    years.push({ year: y, type: r.payType, amount: r.payType === "MONTHLY" ? monthlyTotal(r) : r.payAmount });
  }
  if (years.length === 0) return null;

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {[...years].reverse().map((cur, i, arr) => {
        const prev = arr[i + 1];
        const diff = prev && prev.type === cur.type ? cur.amount - prev.amount : null;
        return (
          <div key={cur.year} className="flex items-center gap-3 px-4 py-3">
            <p className="w-16 shrink-0 text-sm font-bold text-ink tnum">{cur.year}年</p>
            <p className="min-w-0 flex-1 text-sm text-ink tnum">
              {PAY_TYPE_LABEL[cur.type as PayType] ?? cur.type}
              {cur.type === "MONTHLY" ? "（月の人件費）" : ""} <b>{fmtYen(cur.amount)}</b>
            </p>
            {diff != null && diff !== 0 && (
              <p className={`shrink-0 text-xs font-semibold tnum ${diff > 0 ? "text-emerald-700" : "text-status-danger"}`}>
                {diff > 0 ? "＋" : "−"}
                {fmtYen(Math.abs(diff))}
                {prev.amount > 0 && `（${diff > 0 ? "＋" : "−"}${Math.abs((diff / prev.amount) * 100).toFixed(1)}%）`}
              </p>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export type MonthRow = { ym: string; month: UserMonthCost | undefined };

// 月ごとの人件費（直近12か月）。棒の長さは人件費。
export function MonthlyCostTable({ rows }: { rows: MonthRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.month?.total ?? 0));
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {[...rows].reverse().map(({ ym, month }) => {
        const total = month?.total ?? 0;
        const days = month?.workDays ?? 0;
        return (
          <div key={ym} className="px-4 py-2.5">
            <div className="flex items-baseline gap-3 text-sm tnum">
              <p className="w-20 shrink-0 font-bold text-ink">
                {Number(ym.slice(0, 4))}年{Number(ym.slice(5))}月
              </p>
              <p className="min-w-0 flex-1 text-ink-muted">
                {days}日・{fmtWorkMinutes(month?.minutes ?? 0)}
                {days > 0 && total > 0 && ` ・1人工 ${fmtYen(Math.round(total / days))}`}
              </p>
              <p className="shrink-0 font-bold text-ink">{total > 0 ? fmtYen(Math.round(total)) : "—"}</p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(total / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}
