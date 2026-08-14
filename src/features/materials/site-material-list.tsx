"use client";

import { useState, useTransition } from "react";
import { Package, Trash2, EyeOff, Eye } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/modal";
import { toggleSiteMaterial, deleteSiteMaterial } from "./ocr-actions";
import { MATERIAL_DOCUMENT_TYPE_LABEL, type MaterialDocumentType } from "@/lib/constants";

export type SiteMaterialRow = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number | null;
  documentType: string | null;
  supplier: string | null;
  active: boolean;
};

// 現場に登録済みの材料一覧（最高管理者のみ）。単価・金額を含めて表示し、無効化/削除できる。
export function SiteMaterialList({ materials }: { materials: SiteMaterialRow[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<SiteMaterialRow | null>(null);

  function run(action: () => Promise<{ error?: string; ok?: boolean }>, ok?: string) {
    startTransition(async () => {
      const res = await action();
      if (res.error) toast(res.error, { type: "error" });
      else if (ok) toast(ok);
    });
  }

  if (materials.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface-subtle px-4 py-6 text-center text-sm text-ink-muted">
        まだ材料が登録されていません
      </p>
    );
  }

  // 原価（税抜き）合計 → 消費税(10%) → 税込み合計。OCRで読み取る金額は税抜き。
  const subtotal = materials
    .filter((m) => m.active)
    .reduce((sum, m) => sum + (m.amount ?? 0), 0);
  const totalWithTax = subtotal + Math.round(subtotal * 0.1);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-ink-muted">有効な材料 {materials.filter((m) => m.active).length}件</span>
        <span className="text-xs text-ink-muted">
          原価 税抜 <span className="font-bold text-ink">¥{subtotal.toLocaleString()}</span>
          <span className="mx-1 text-ink-faint">/</span>
          税込 <span className="font-bold text-ink">¥{totalWithTax.toLocaleString()}</span>
        </span>
      </div>

      {materials.map((m) => (
        <div
          key={m.id}
          className={
            m.active
              ? "rounded-xl border border-line bg-surface p-3"
              : "rounded-xl border border-line bg-surface-subtle p-3 opacity-60"
          }
        >
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">
                {m.name}
                {!m.active && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">（無効）</span>}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {[
                  m.quantity ? `数量 ${m.quantity}${m.unit ?? ""}` : m.unit ? `単位 ${m.unit}` : null,
                  m.unitPrice != null ? `単価 ¥${m.unitPrice.toLocaleString()}` : null,
                  m.amount != null ? `金額 ¥${m.amount.toLocaleString()}` : null,
                ]
                  .filter(Boolean)
                  .join(" ・ ") || "—"}
              </p>
              {(m.documentType || m.supplier) && (
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {m.documentType
                    ? MATERIAL_DOCUMENT_TYPE_LABEL[m.documentType as MaterialDocumentType] ?? m.documentType
                    : ""}
                  {m.documentType && m.supplier ? " ・ " : ""}
                  {m.supplier ?? ""}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => run(() => toggleSiteMaterial(m.id), m.active ? "無効にしました" : "有効にしました")}
                disabled={pending}
                aria-label={m.active ? "無効にする" : "有効にする"}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken"
              >
                {m.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(m)}
                disabled={pending}
                aria-label="削除"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-red-50 hover:text-status-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="材料を削除しますか？"
        description={deleteTarget ? `「${deleteTarget.name}」を削除します。この操作は取り消せません。` : ""}
        confirmLabel="削除する"
        danger
        onConfirm={() => {
          if (deleteTarget) run(() => deleteSiteMaterial(deleteTarget.id), "材料を削除しました");
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
