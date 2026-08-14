import { Package } from "lucide-react";
import { Card } from "@/components/ui/card";

// 現場詳細に表示する登録材料の読み取り専用サマリー（サーバーコンポーネント）。
// 材料の種類・数量は全員に表示。単価/金額（原価）は showAmount=true（最高管理者）のみ描画する。
// ※ showAmount=false のとき金額はHTMLに一切含まれない（サーバー描画で分岐するため）。
export type SiteMaterialSummaryRow = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number | null;
};

export function SiteMaterialSummary({
  materials,
  showAmount,
}: {
  materials: SiteMaterialSummaryRow[];
  showAmount: boolean;
}) {
  if (materials.length === 0) {
    return <Card className="p-4 text-sm text-ink-muted">登録材料はありません</Card>;
  }

  const subtotal = materials.reduce((s, m) => s + (m.amount ?? 0), 0);
  const totalWithTax = subtotal + Math.round(subtotal * 0.1);

  return (
    <Card className="p-0">
      <div className="divide-y divide-line">
        {materials.map((m) => (
          <div key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Package className="h-4 w-4 shrink-0 text-ink-muted" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                {showAmount && m.unitPrice != null && (
                  <p className="text-xs text-ink-muted">単価 ¥{m.unitPrice.toLocaleString()}</p>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm tnum text-ink-soft">
                {m.quantity ?? "—"}
                {m.unit ?? ""}
              </p>
              {showAmount && m.amount != null && (
                <p className="text-xs tnum font-semibold text-ink">¥{m.amount.toLocaleString()}</p>
              )}
            </div>
          </div>
        ))}
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
