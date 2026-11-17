import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { jstDateTimeLabel } from "@/lib/date";
import { receiptView } from "@/lib/receipts";
import { ReceiptEditor } from "@/features/receipts/receipt-editor";

// 領収書1枚の確認・修正（管理者以上）。写真を見ながら読み取り結果を直して「確認済み」にする。
export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const r = await db.receipt.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      export: { select: { seq: true, createdAt: true } },
    },
  });
  if (!r) notFound();

  // 次に確認するもの（要確認・読み取り失敗を日付順に）
  const todo = await db.receipt.findMany({
    where: { exportId: null, status: { in: ["REVIEW", "FAILED", "PROCESSING"] }, id: { not: id } },
    orderBy: [{ receiptDate: "asc" }, { createdAt: "asc" }],
    select: { id: true },
    take: 1,
  });

  // 同じ日・同じ金額の領収書（二重入力の疑い）
  const similar =
    r.receiptDate && r.totalAmount != null
      ? await db.receipt.findMany({
          where: { id: { not: id }, receiptDate: r.receiptDate, totalAmount: r.totalAmount },
          select: { id: true, vendor: true, export: { select: { seq: true } } },
        })
      : [];

  const names = await db.user.findMany({
    where: { id: { in: [r.uploadedById, r.confirmedById].filter((v): v is string => !!v) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(names.map((u) => [u.id, u.name]));

  const backMonth = r.receiptDate ? r.receiptDate.slice(0, 7) : "none";

  return (
    <div>
      <PageHeader title="領収書の確認" backHref={`/receipts?m=${backMonth}`} />
      <PageContainer>
        <ReceiptEditor
          // 読み直し・保存で中身が変わったら入力欄を作り直す
          key={r.updatedAt.toISOString()}
          receipt={{
            id: r.id,
            view: receiptView(r),
            isPdf: r.mimeType === "application/pdf",
            receiptDate: r.receiptDate ?? "",
            vendor: r.vendor ?? "",
            invoiceNumber: r.invoiceNumber ?? "",
            totalAmount: r.totalAmount,
            creditAccount: r.creditAccount,
            description: r.description ?? "",
            ocrError: r.ocrError,
            ocrModel: r.ocrModel,
            lines: r.lines.map((l) => ({ account: l.account, taxCategory: l.taxCategory, amount: l.amount })),
            exportSeq: r.export?.seq ?? null,
            exportedAtLabel: r.export ? jstDateTimeLabel(r.export.createdAt) : null,
            uploadedLabel: `${jstDateTimeLabel(r.createdAt)}${r.uploadedById ? `・${nameOf.get(r.uploadedById) ?? ""}` : ""}`,
            confirmedLabel: r.confirmedAt
              ? `${jstDateTimeLabel(r.confirmedAt)}${r.confirmedById ? `・${nameOf.get(r.confirmedById) ?? ""}` : ""}`
              : null,
          }}
          nextTodoId={todo[0]?.id ?? null}
          backHref={`/receipts?m=${backMonth}`}
          similar={similar.map((s) => ({ id: s.id, vendor: s.vendor, exportSeq: s.export?.seq ?? null }))}
        />
      </PageContainer>
    </div>
  );
}
