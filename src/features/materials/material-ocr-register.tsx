"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Loader2, Save, Trash2, Plus, AlertTriangle, ScanLine, Check, X,
  Image as ImageIcon,
} from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  ocrDeliverySlip,
  registerSiteMaterials,
  type OcrResult,
} from "./ocr-actions";
import { MATERIAL_DOCUMENT_TYPE_LABEL } from "@/lib/constants";

// 画像を本体（最大1600px・OCR精度優先）＋サムネイル（320px）へ圧縮する
const MAX_DIM = 1600;
const THUMB_DIM = 320;

function scaleDims(w: number, h: number, max: number) {
  if (w > h && w > max) return { width: max, height: Math.round((h * max) / w) };
  if (h >= w && h > max) return { width: Math.round((w * max) / h), height: max };
  return { width: w, height: h };
}
function drawJpeg(img: HTMLImageElement, w: number, h: number, q: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas error");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", q);
}
function compress(file: File): Promise<{ dataUrl: string; thumbUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const main = scaleDims(img.width, img.height, MAX_DIM);
          const dataUrl = drawJpeg(img, main.width, main.height, 0.8);
          const th = scaleDims(img.width, img.height, THUMB_DIM);
          const thumbUrl = drawJpeg(img, th.width, th.height, 0.6);
          resolve({ dataUrl, thumbUrl, width: main.width, height: main.height });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// PDFはbase64化して未圧縮で送るため上限を設ける（Server Action の bodySizeLimit=12mb 内に収める）
const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8MB

/** ファイルを dataURL（base64）として読み込む（PDF用・無圧縮） */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type Row = {
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string; // 円（文字列で保持）
  amount: string; // 円（文字列で保持）
};

// 画像は圧縮して thumb/寸法を持つ。PDFは無圧縮のため dataUrl のみ。
type Photo = { dataUrl: string; thumbUrl?: string; width?: number; height?: number };

function toRows(items: OcrResult["items"]): Row[] {
  return items.map((i) => ({
    name: i.name ?? "",
    quantity: i.quantity ?? "",
    unit: i.unit ?? "",
    unitPrice: i.unitPrice != null ? String(i.unitPrice) : "",
    amount: i.amount != null ? String(i.amount) : "",
  }));
}

function toIntOrNull(s: string): number | null {
  const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

export function MaterialOcrRegister({ site }: { site: { id: string; name: string } }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null); // カメラ撮影（スマホ）
  const fileSelectRef = useRef<HTMLInputElement>(null); // ファイル選択（PC・画像/PDF）

  const [busy, setBusy] = useState(false); // 圧縮＋OCR中
  const [saving, startSave] = useTransition();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [detectedSiteName, setDetectedSiteName] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<"" | "DELIVERY" | "ORDER">("");
  const [supplier, setSupplier] = useState("");
  const [orderedAt, setOrderedAt] = useState(""); // YYYY-MM-DD
  const [rows, setRows] = useState<Row[]>([]);
  const [reviewing, setReviewing] = useState(false); // OCR後の確認画面

  function reset() {
    setPhoto(null);
    setDetectedSiteName(null);
    setDocumentType("");
    setSupplier("");
    setOrderedAt("");
    setRows([]);
    setReviewing(false);
    if (fileRef.current) fileRef.current.value = "";
    if (fileSelectRef.current) fileSelectRef.current.value = "";
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // 同じファイルを連続選択しても発火するようリセット
    if (fileRef.current) fileRef.current.value = "";
    if (fileSelectRef.current) fileSelectRef.current.value = "";
  }

  async function handleFile(file: File) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImage =
      file.type === "image/jpeg" ||
      file.type === "image/png" ||
      /\.(jpe?g|png)$/i.test(file.name);
    if (!isPdf && !isImage) {
      toast("対応していない形式です。JPEG・PNG・PDF のいずれかを選んでください。", { type: "error" });
      return;
    }
    if (isPdf && file.size > MAX_PDF_BYTES) {
      toast("PDFのサイズが大きすぎます（8MBまで）。分割やページ指定でお試しください。", { type: "error" });
      return;
    }
    setBusy(true);
    try {
      // PDFは無圧縮でそのまま、画像は圧縮してから読み取る
      const media: Photo = isPdf
        ? { dataUrl: await readAsDataUrl(file) }
        : await compress(file);
      setPhoto(media);
      const res = await ocrDeliverySlip({ dataUrl: media.dataUrl });
      if (res.status === "unconfigured") {
        toast("OCRが未設定です（管理者にAPIキー設定を依頼してください）。手入力で登録できます。", { type: "error" });
        setRows([{ name: "", quantity: "", unit: "", unitPrice: "", amount: "" }]);
        setReviewing(true);
        return;
      }
      if (res.status === "error") {
        toast(res.message, { type: "error" });
        setRows([{ name: "", quantity: "", unit: "", unitPrice: "", amount: "" }]);
        setReviewing(true);
        return;
      }
      const r = res.result;
      setDetectedSiteName(r.siteName);
      setDocumentType(r.documentType ?? "");
      setSupplier(r.supplier ?? "");
      setOrderedAt(r.orderedAt && /^\d{4}-\d{2}-\d{2}$/.test(r.orderedAt) ? r.orderedAt : "");
      setRows(r.items.length > 0 ? toRows(r.items) : [{ name: "", quantity: "", unit: "", unitPrice: "", amount: "" }]);
      setReviewing(true);
      toast(`${r.items.length}件の材料を読み取りました。内容を確認してください。`);
    } catch {
      toast("ファイルの読み込みに失敗しました。もう一度お試しください。", { type: "error" });
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { name: "", quantity: "", unit: "", unitPrice: "", amount: "" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    const items = rows
      .filter((r) => r.name.trim() !== "")
      .map((r) => ({
        name: r.name.trim(),
        quantity: r.quantity.trim() || null,
        unit: r.unit.trim() || null,
        unitPrice: toIntOrNull(r.unitPrice),
        amount: toIntOrNull(r.amount),
      }));
    if (items.length === 0) {
      toast("材料名を1件以上入力してください", { type: "error" });
      return;
    }
    startSave(async () => {
      const res = await registerSiteMaterials({
        siteId: site.id,
        documentType: documentType || null,
        supplier: supplier.trim() || null,
        orderedAt: orderedAt || null,
        items,
        photo: photo ?? null,
      });
      if (res.error) {
        toast(res.error, { type: "error" });
        return;
      }
      toast(`${res.count}件の材料を「${site.name}」に登録しました`);
      reset();
      router.refresh();
    });
  }

  const totalAmount = rows.reduce((sum, r) => sum + (toIntOrNull(r.amount) ?? 0), 0);
  const siteNameMismatch =
    detectedSiteName != null &&
    detectedSiteName.trim() !== "" &&
    !detectedSiteName.includes(site.name) &&
    !site.name.includes(detectedSiteName);

  return (
    <div className="space-y-4">
      {/* カメラ撮影（スマホ） */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onInputChange}
      />
      {/* ファイル選択（PC・画像/PDF） */}
      <input
        ref={fileSelectRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={onInputChange}
      />

      {!reviewing ? (
        <div className="rounded-2xl border border-line bg-surface-subtle p-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <ScanLine className="h-7 w-7" />
          </div>
          <p className="text-sm font-bold text-ink">納品書・発注書を読み取り</p>
          <p className="mt-1 text-xs text-ink-muted">
            撮影またはファイル（JPEG・PNG・PDF）を選ぶと、材料名・数量・金額を自動で読み取ります。<br />
            登録先の現場：<span className="font-bold text-ink">{site.name}</span>
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className={buttonClass({ size: "lg", className: "mt-4 w-full" })}
          >
            {busy ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> 読み取り中...</>
            ) : (
              <><Camera className="h-5 w-5" /> 伝票を撮影して読み取る</>
            )}
          </button>
          <button
            type="button"
            onClick={() => fileSelectRef.current?.click()}
            disabled={busy}
            className={buttonClass({ variant: "outline", size: "lg", className: "mt-2 w-full" })}
          >
            <ImageIcon className="h-5 w-5" /> ファイルを選択（画像・PDF）
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 現場名の確認 */}
          <div
            className={
              siteNameMismatch
                ? "flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30"
                : "flex items-start gap-2 rounded-2xl border border-line bg-surface-subtle px-4 py-3"
            }
          >
            {siteNameMismatch ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-active" />
            )}
            <div className="text-sm">
              <p className="text-ink-soft">
                登録先の現場：<span className="font-bold text-ink">{site.name}</span>
              </p>
              {detectedSiteName ? (
                <p className="mt-0.5 text-xs text-ink-muted">
                  伝票の宛名/現場名：「{detectedSiteName}」
                  {siteNameMismatch && "（現場名が一致しない可能性があります。ご確認ください）"}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-ink-muted">伝票から現場名は読み取れませんでした。</p>
              )}
            </div>
          </div>

          {/* 伝票メタ情報 */}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-ink-muted">
              伝票種別
              <Select
                className="mt-1"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as "" | "DELIVERY" | "ORDER")}
              >
                <option value="">未選択</option>
                <option value="DELIVERY">{MATERIAL_DOCUMENT_TYPE_LABEL.DELIVERY}</option>
                <option value="ORDER">{MATERIAL_DOCUMENT_TYPE_LABEL.ORDER}</option>
              </Select>
            </label>
            <label className="text-xs font-semibold text-ink-muted">
              伝票日付
              <Input
                className="mt-1"
                type="date"
                value={orderedAt}
                onChange={(e) => setOrderedAt(e.target.value)}
              />
            </label>
            <label className="col-span-2 text-xs font-semibold text-ink-muted">
              仕入先
              <Input
                className="mt-1"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="仕入先・発行元"
              />
            </label>
          </div>

          {/* 明細 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-ink">材料明細</span>
              <span className="text-xs text-ink-muted">
                合計 <span className="font-bold text-ink">¥{totalAmount.toLocaleString()}</span>
              </span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start gap-2">
                  <Input
                    aria-label="材料名"
                    placeholder="材料名"
                    value={r.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label="この行を削除"
                    className="mt-1 shrink-0 text-ink-faint hover:text-status-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    aria-label="数量"
                    placeholder="数量"
                    inputMode="decimal"
                    value={r.quantity}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  />
                  <Input
                    aria-label="単位"
                    placeholder="単位（枚/本 等）"
                    value={r.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })}
                  />
                  <Input
                    aria-label="単価（円）"
                    placeholder="単価（円）"
                    inputMode="numeric"
                    value={r.unitPrice}
                    onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                  />
                  <Input
                    aria-label="金額（円）"
                    placeholder="金額（円）"
                    inputMode="numeric"
                    value={r.amount}
                    onChange={(e) => updateRow(i, { amount: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-surface-subtle py-2.5 text-sm font-semibold text-ink-muted active:scale-95"
            >
              <Plus className="h-4 w-4" /> 行を追加
            </button>
          </div>

          <p className="text-[11px] text-ink-faint">
            ※ 単価・金額は最高管理者のみが閲覧できます。スタッフの日報では材料名の選択にのみ使われます。
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className={buttonClass({ variant: "ghost", size: "lg", className: "flex-1" })}
            >
              <X className="h-5 w-5" /> やり直す
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={buttonClass({ size: "lg", className: "flex-1" })}
            >
              {saving ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> 登録中...</>
              ) : (
                <><Save className="h-5 w-5" /> この現場に登録</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
