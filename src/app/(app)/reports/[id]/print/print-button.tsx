"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useRouter } from "next/navigation";

// 印刷 / PDF保存 ボタン（@media print で非表示）。
// PDF保存はブラウザの印刷ダイアログから「PDFに保存」を選ぶ。
export function PrintToolbar({ reportId }: { reportId: string }) {
  const router = useRouter();
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 print:hidden">
      <button
        type="button"
        onClick={() => router.push(`/reports/${reportId}`)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        日報に戻る
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-bold text-white shadow-card"
      >
        <Printer className="h-4 w-4" />
        印刷 / PDF保存
      </button>
    </div>
  );
}
