"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, Loader2, Plus, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  CREDIT_ACCOUNTS,
  RECEIPT_ACCOUNTS,
  RECEIPT_VIEW_LABEL,
  receiptMemo,
  TAX_10,
  TAX_CATEGORIES,
  yen,
  type ReceiptView,
} from "@/lib/receipts";
import { deleteReceipt, runReceiptOcr, saveReceipt, unconfirmReceipt } from "./actions";

type Line = { account: string; taxCategory: string; amount: string };

export type EditorReceipt = {
  id: string;
  view: ReceiptView;
  isPdf: boolean;
  receiptDate: string;
  vendor: string;
  invoiceNumber: string;
  totalAmount: number | null;
  creditAccount: string;
  description: string;
  ocrError: string | null;
  ocrModel: string | null;
  lines: { account: string; taxCategory: string; amount: number }[];
  exportSeq: number | null;
  exportedAtLabel: string | null;
  uploadedLabel: string;
  confirmedLabel: string | null;
};

const toInt = (s: string): number | null => {
  const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
};

export function ReceiptEditor({
  receipt: r,
  nextTodoId,
  backHref,
  similar,
}: {
  receipt: EditorReceipt;
  nextTodoId: string | null;
  backHref: string;
  similar: { id: string; vendor: string | null; exportSeq: number | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const locked = r.view === "exported";

  const [receiptDate, setReceiptDate] = useState(r.receiptDate);
  const [vendor, setVendor] = useState(r.vendor);
  const [invoiceNumber, setInvoiceNumber] = useState(r.invoiceNumber);
  const [total, setTotal] = useState(r.totalAmount != null ? String(r.totalAmount) : "");
  const [creditAccount, setCreditAccount] = useState(r.creditAccount);
  const [description, setDescription] = useState(r.description);
  const [lines, setLines] = useState<Line[]>(
    r.lines.length
      ? r.lines.map((l) => ({ ...l, amount: String(l.amount) }))
      : [{ account: "", taxCategory: TAX_10, amount: r.totalAmount != null ? String(r.totalAmount) : "" }],
  );
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sum = lines.reduce((s, l) => s + (toInt(l.amount) ?? 0), 0);
  const totalNum = toInt(total);
  const mismatch = totalNum != null && sum !== totalNum;

  function setLine(i: number, p: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...p } : l)));
  }

  function save(confirm: boolean) {
    start(async () => {
      const res = await saveReceipt({
        id: r.id,
        receiptDate,
        vendor,
        invoiceNumber,
        totalAmount: totalNum,
        creditAccount,
        description,
        lines: lines
          .filter((l) => l.account.trim() || l.amount.trim())
          .map((l) => ({ account: l.account, taxCategory: l.taxCategory, amount: toInt(l.amount) ?? 0 })),
        confirm,
      });
      if (res.error) {
        toast(res.error, { type: "error" });
        return;
      }
      if (confirm) {
        toast("確認済みにしました");
        router.push(nextTodoId ? `/receipts/${nextTodoId}` : backHref);
      } else {
        toast("保存しました");
        router.refresh();
      }
    });
  }

  async function reread(precise: boolean) {
    setReading(true);
    const res = await runReceiptOcr(r.id, precise);
    setReading(false);
    if (res.error) toast(res.error, { type: "error" });
    else toast(precise ? "高精度で読み直しました" : "読み直しました");
    // 読み直した内容で入力欄を作り直す（ページ側で updatedAt を key にしている）
    router.refresh();
  }

  const imgSrc = `/api/receipts/${r.id}`;

  return (
    <div className="grid gap-5 md:grid-cols-2 md:items-start">
      {/* 写真 */}
      <div className="md:sticky md:top-24">
        {r.isPdf ? (
          <div className="card overflow-hidden">
            <iframe src={imgSrc} title="領収書のPDF" className="h-[60vh] w-full md:h-[75vh]" />
          </div>
        ) : (
          <a href={imgSrc} target="_blank" rel="noreferrer" className="card block overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc} alt="領収書" className="max-h-[60vh] w-full bg-surface-sunken object-contain md:max-h-[75vh]" />
          </a>
        )}
        <a href={imgSrc} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-ink-muted underline">
          <ExternalLink className="h-3.5 w-3.5" /> 別のタブで大きく開く
        </a>
      </div>

      {/* 入力 */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              r.view === "exported" ? "past" : r.view === "ready" ? "active" : r.view === "review" ? "warn" : r.view === "reading" ? "info" : "danger"
            }
          >
            {r.view === "exported" ? `出力済み 第${r.exportSeq}回` : RECEIPT_VIEW_LABEL[r.view]}
          </Badge>
          <span className="text-xs text-ink-muted">登録 {r.uploadedLabel}</span>
          {r.confirmedLabel && <span className="text-xs text-ink-muted">確認 {r.confirmedLabel}</span>}
        </div>

        {locked && (
          <p className="rounded-xl bg-surface-sunken p-3 text-sm text-ink-soft">
            第{r.exportSeq}回（{r.exportedAtLabel}）でCSVに出力済みのため、直せません。直す場合は一覧の「出力の履歴」でこの回を取り消してください。
          </p>
        )}
        {r.ocrError && !locked && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {r.ocrError}
          </p>
        )}
        {similar.length > 0 && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" /> 同じ日・同じ金額の領収書があります（二重に入れていませんか？）
            </p>
            <ul className="mt-1 space-y-0.5">
              {similar.map((s) => (
                <li key={s.id}>
                  <Link href={`/receipts/${s.id}`} className="underline">
                    {s.vendor ?? "店名なし"}
                    {s.exportSeq ? `（出力済み 第${s.exportSeq}回）` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(r.view === "reading" || r.view === "failed") && !reading ? (
          <div className="card space-y-3 p-4">
            <p className="text-sm text-ink-soft">
              {r.view === "reading" ? "読み取り中です。しばらくしてから画面を更新してください。" : "まだ読み取れていません。"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => reread(false)}>
                <RotateCw className="h-4 w-4" /> 読み取る
              </Button>
              <Button type="button" variant="outline" onClick={() => reread(true)}>
                <Sparkles className="h-4 w-4" /> 高精度で読み取る
              </Button>
            </div>
          </div>
        ) : null}
        {reading && (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> 読み取っています…（10〜30秒ほど）
          </p>
        )}

        <fieldset disabled={locked || pending || reading} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="日付" required>
              <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </Field>
            <Field label="合計（税込）">
              <Input
                inputMode="numeric"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="例: 1320"
              />
            </Field>
          </div>
          <Field label="店名・発行元">
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </Field>
          <Field label="内容" description={`CSVの摘要：${receiptMemo({ vendor, description }) || "（空）"}`}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例: ボールペン・付箋" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="支払い方法（貸方）">
              <Select value={creditAccount} onChange={(e) => setCreditAccount(e.target.value)}>
                {!CREDIT_ACCOUNTS.some((c) => c.value === creditAccount) && (
                  <option value={creditAccount}>{creditAccount}</option>
                )}
                {CREDIT_ACCOUNTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="登録番号（インボイス）">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="T1234567890123" />
            </Field>
          </div>

          {/* 明細（税率・勘定科目ごと） */}
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink-soft">勘定科目と金額（税率ごと）</p>
            <datalist id="receipt-accounts">
              {RECEIPT_ACCOUNTS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-center">
                  <Input
                    list="receipt-accounts"
                    value={l.account}
                    onChange={(e) => setLine(i, { account: e.target.value })}
                    placeholder="勘定科目"
                    aria-label="勘定科目"
                  />
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                    disabled={lines.length <= 1}
                    className="flex h-12 w-10 items-center justify-center text-ink-muted disabled:opacity-30 sm:order-last"
                    aria-label="この行を消す"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <Select value={l.taxCategory} onChange={(e) => setLine(i, { taxCategory: e.target.value })} aria-label="税区分">
                    {!(TAX_CATEGORIES as readonly string[]).includes(l.taxCategory) && (
                      <option value={l.taxCategory}>{l.taxCategory}</option>
                    )}
                    {TAX_CATEGORIES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <Input
                    inputMode="numeric"
                    value={l.amount}
                    onChange={(e) => setLine(i, { amount: e.target.value })}
                    placeholder="税込金額"
                    aria-label="税込金額"
                    className="text-right"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, { account: "", taxCategory: TAX_10, amount: "" }])}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700"
              >
                <Plus className="h-4 w-4" /> 行を足す（税率や科目が分かれるとき）
              </button>
              <p className={cn("text-sm tnum", mismatch ? "font-bold text-status-danger" : "text-ink-soft")}>
                明細の合計 {yen(sum)}
                {mismatch && totalNum != null && `（合計と ${yen(Math.abs(totalNum - sum))} ずれています）`}
              </p>
            </div>
          </div>
        </fieldset>

        {!locked && (
          <div className="space-y-2 border-t border-line pt-4">
            <Button type="button" size="lg" className="w-full" disabled={pending || reading} onClick={() => save(true)}>
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              確認済みにする{nextTodoId ? "（次の要確認へ）" : ""}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={pending || reading} onClick={() => save(false)}>
                保存（あとで確認）
              </Button>
              {r.view === "ready" && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await unconfirmReceipt(r.id);
                      if (res.error) toast(res.error, { type: "error" });
                      else router.refresh();
                    })
                  }
                >
                  要確認に戻す
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                disabled={reading || pending}
                onClick={() => reread(true)}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> 高精度で読み直す
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 text-sm font-semibold text-status-danger"
              >
                <Trash2 className="h-4 w-4" /> 削除
              </button>
            </div>
            {r.ocrModel && <p className="text-right text-[11px] text-ink-faint">読み取り: {r.ocrModel}</p>}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title="この領収書を削除しますか？"
        description="ごみ箱に移ります。30日以内ならごみ箱から元に戻せます。"
        confirmLabel="削除する"
        onConfirm={async () => {
          const res = await deleteReceipt(r.id);
          if (res.error) {
            toast(res.error, { type: "error" });
            return;
          }
          toast("削除しました");
          router.push(backHref);
        }}
      />
    </div>
  );
}
