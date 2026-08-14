import { Package } from "lucide-react";
import { Card } from "@/components/ui/card";

// 現場詳細に表示する登録材料の読み取り専用サマリー（サーバーコンポーネント）。
// 材料名で集計し、残量 = 入荷（登録数量の合計）− 使用量（日報の使用材料の合計）を表示する。
// 種類・数量・残量は全員に表示。単価/金額（原価）は showAmount=true（最高管理者）のみ描画する。
// ※ showAmount=false のとき金額はHTMLに一切含まれない（サーバー描画で分岐するため）。
export type SiteMaterialSummaryRow = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number | null;
};
export type SiteMaterialUsageRow = { name: string; quantity: string | null };

// "600" / "600m" / "1,000" / "10.5本" などから数値部分を取り出す（不可なら null）
function parseQty(s: string | null): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}
function fmtNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

type Agg = {
  name: string;
  unit: string | null;
  registered: number;
  hasQty: boolean;
  rawQty: string | null;
  used: number;
  amount: number;
  hasAmount: boolean;
};

export function SiteMaterialSummary({
  materials,
  usages,
  showAmount,
}: {
  materials: SiteMaterialSummaryRow[];
  usages: SiteMaterialUsageRow[];
  showAmount: boolean;
}) {
  if (materials.length === 0) {
    return <Card className="p-4 text-sm text-ink-muted">登録材料はありません</Card>;
  }

  // 使用量（日報の使用材料）を材料名で集計
  const usedByName = new Map<string, number>();
  for (const u of usages) {
    const q = parseQty(u.quantity);
    if (q == null) continue;
    const key = u.name.trim();
    usedByName.set(key, (usedByName.get(key) ?? 0) + q);
  }

  // 登録材料を材料名で集計（複数伝票分を合算）。表示順は登録順を維持。
  const byName = new Map<string, Agg>();
  const order: string[] = [];
  for (const m of materials) {
    const key = m.name.trim();
    let a = byName.get(key);
    if (!a) {
      a = {
        name: m.name,
        unit: m.unit,
        registered: 0,
        hasQty: false,
        rawQty: null,
        used: usedByName.get(key) ?? 0,
        amount: 0,
        hasAmount: false,
      };
      byName.set(key, a);
      order.push(key);
    }
    if (a.unit == null && m.unit) a.unit = m.unit;
    const q = parseQty(m.quantity);
    if (q != null) {
      a.registered += q;
      a.hasQty = true;
    }
    if (a.rawQty == null && m.quantity) a.rawQty = m.quantity;
    if (m.amount != null) {
      a.amount += m.amount;
      a.hasAmount = true;
    }
  }
  const aggs = order.map((k) => byName.get(k)!);

  const subtotal = aggs.reduce((s, a) => s + a.amount, 0);
  const totalWithTax = subtotal + Math.round(subtotal * 0.1);

  return (
    <Card className="p-0">
      <div className="divide-y divide-line">
        {aggs.map((a) => {
          const unit = a.unit ?? "";
          const remaining = a.hasQty ? a.registered - a.used : null;
          return (
            <div key={a.name} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Package className="h-4 w-4 shrink-0 text-ink-muted" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{a.name}</p>
                  {a.hasQty ? (
                    <p className="tnum text-xs text-ink-muted">
                      入荷 {fmtNum(a.registered)}
                      {unit} ・ 使用 {fmtNum(a.used)}
                      {unit}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-muted">数量 {a.rawQty ?? "—"}</p>
                  )}
                  {showAmount && a.hasAmount && (
                    <p className="tnum text-xs text-ink-muted">金額 ¥{a.amount.toLocaleString()}</p>
                  )}
                </div>
              </div>
              {remaining != null && (
                <div className="shrink-0 text-right">
                  <p
                    className={`tnum text-sm font-bold ${remaining < 0 ? "text-status-danger" : "text-ink"}`}
                  >
                    残 {fmtNum(remaining)}
                    {unit}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAmount && (
        <div className="space-y-1 border-t border-line px-4 py-3 text-sm">
          <div className="flex items-center justify-between text-ink-soft">
            <span>原価 税抜</span>
            <span className="tnum font-semibold text-ink">¥{subtotal.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-ink">税込（10%）</span>
            <span className="tnum font-bold text-brand-600">¥{totalWithTax.toLocaleString()}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
