"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileUp, Loader2, Check, AlertTriangle, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readLocalCopy, uploadToBlob } from "@/lib/blob-upload";
import { formatMb, OCR_PDF_MAX_BYTES, PDF_MIME } from "@/lib/media-limits";
import { createReceipt, findDuplicateReceipt, runReceiptOcr } from "./actions";

// 写真は OCR に十分な 1600px の JPEG に縮めてから Blob へ直接上げる（4.5MB 上限を避ける）。
const MAX_DIM = 1600;
const THUMB_DIM = 240;
/** 同時に処理する枚数（読み取り API と回線の負荷のバランス） */
const CONCURRENCY = 3;

type ItemState = "waiting" | "uploading" | "reading" | "done" | "duplicate" | "error";
type Item = {
  key: string;
  file: File;
  name: string;
  state: ItemState;
  progress: number;
  message?: string;
};

function scaleDims(w: number, h: number, max: number) {
  if (w >= h && w > max) return { width: max, height: Math.round((h * max) / w) };
  if (h > w && h > max) return { width: Math.round((w * max) / h), height: max };
  return { width: w, height: h };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, max: number): HTMLCanvasElement {
  const { width, height } = scaleDims(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

async function compressImage(file: File): Promise<{ body: Blob; thumbUrl: string }> {
  const img = await loadImage(file);
  const main = draw(img, MAX_DIM);
  const body = await new Promise<Blob>((resolve, reject) =>
    main.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.82),
  );
  const thumbUrl = draw(img, THUMB_DIM).toDataURL("image/jpeg", 0.6);
  return { body, thumbUrl };
}

async function sha256(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

const isPdf = (f: File) => f.type === PDF_MIME || f.name.toLowerCase().endsWith(".pdf");
const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

export function ReceiptUploader() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const running = useRef(0);
  const seenHashes = useRef(new Set<string>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((key: string, p: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  // 読み取りが終わるたびに一覧を更新する（立て続けに終わるときはまとめて1回）
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 800);
  }, [router]);

  const processOne = useCallback(
    async (item: Item) => {
      const { file, key } = item;
      patch(key, { state: "uploading", progress: 0 });
      try {
        const hash = await sha256(file);
        if (hash) {
          if (seenHashes.current.has(hash)) {
            patch(key, { state: "duplicate", message: "同じファイルを2回選んでいます" });
            return;
          }
          seenHashes.current.add(hash);
          const dup = await findDuplicateReceipt(hash);
          if (dup) {
            patch(key, { state: "duplicate", message: `登録済みです（${dup}）` });
            return;
          }
        }

        let body: Blob;
        let mimeType: "image/jpeg" | "application/pdf";
        let thumbUrl: string | null = null;
        if (isPdf(file)) {
          if (file.size > OCR_PDF_MAX_BYTES) {
            patch(key, { state: "error", message: `PDFは${formatMb(OCR_PDF_MAX_BYTES)}までです` });
            return;
          }
          const copy = await readLocalCopy(file, PDF_MIME);
          if ("error" in copy) {
            patch(key, { state: "error", message: copy.error });
            return;
          }
          body = copy.body;
          mimeType = "application/pdf";
        } else {
          try {
            const c = await compressImage(file);
            body = c.body;
            thumbUrl = c.thumbUrl;
          } catch {
            patch(key, {
              state: "error",
              message: "この写真は開けませんでした（HEICなど）。JPEGで保存してから選んでください",
            });
            return;
          }
          mimeType = "image/jpeg";
        }

        const up = await uploadToBlob(body, mimeType, file.name, (r) => patch(key, { progress: r }));
        if ("error" in up) {
          patch(key, { state: "error", message: up.error });
          return;
        }
        const created = await createReceipt({
          blobPath: up.blobPath,
          mimeType,
          thumbUrl,
          fileHash: hash,
          fileName: file.name.slice(0, 200),
        });
        if ("duplicate" in created) {
          patch(key, { state: "duplicate", message: `登録済みです（${created.duplicate}）` });
          return;
        }
        if ("error" in created) {
          patch(key, { state: "error", message: created.error });
          return;
        }
        scheduleRefresh();
        patch(key, { state: "reading" });
        const ocr = await runReceiptOcr(created.id);
        patch(key, ocr.error ? { state: "error", message: ocr.error } : { state: "done" });
        scheduleRefresh();
      } catch {
        patch(key, { state: "error", message: "通信に失敗しました。電波の良い場所で選び直してください" });
      }
    },
    [patch, scheduleRefresh],
  );

  // 待ち行列から同時に CONCURRENCY 件まで処理する
  useEffect(() => {
    const waiting = items.filter((i) => i.state === "waiting");
    while (running.current < CONCURRENCY && waiting.length > 0) {
      const next = waiting.shift()!;
      running.current++;
      // 二重に拾わないよう、処理開始の印を先に付ける
      patch(next.key, { state: "uploading" });
      void processOne(next).finally(() => {
        running.current--;
        setItems((prev) => [...prev]); // 次の待ちを拾うために再評価
      });
    }
  }, [items, patch, processOne]);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const files = Array.from(list);
    const accepted: Item[] = [];
    const rejected: Item[] = [];
    for (const f of files) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (isPdf(f) || isImage(f)) {
        accepted.push({ key, file: f, name: f.name, state: "waiting", progress: 0 });
      } else {
        rejected.push({ key, file: f, name: f.name, state: "error", progress: 0, message: "写真かPDFを選んでください" });
      }
    }
    setItems((prev) => [...accepted, ...rejected, ...prev]);
  }

  const active = items.filter((i) => i.state === "waiting" || i.state === "uploading" || i.state === "reading").length;
  const done = items.filter((i) => i.state === "done").length;
  const problems = items.filter((i) => i.state === "error" || i.state === "duplicate").length;

  return (
    <section className="card p-4 md:p-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors md:py-8",
          dragging ? "border-brand-500 bg-brand-50" : "border-line-strong bg-surface-subtle",
        )}
      >
        <p className="hidden text-sm font-semibold text-ink md:block">
          領収書・レシートの写真やPDFを、ここにまとめてドラッグ＆ドロップ
        </p>
        <p className="text-sm font-semibold text-ink md:hidden">領収書・レシートを撮影するか、写真を選んでください</p>
        <p className="mt-1 text-xs text-ink-muted">何枚でもまとめて入れられます。読み取りは自動で始まります。</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className={buttonClass({ variant: "primary", className: "md:hidden" })}
          >
            <Camera className="h-5 w-5" /> 撮影する
          </button>
          <button
            type="button"
            onClick={() => pickRef.current?.click()}
            className={buttonClass({ variant: "outline" })}
          >
            <FileUp className="h-5 w-5" /> 写真・PDFを選ぶ
          </button>
        </div>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {items.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm">
            <p className="font-semibold text-ink">
              {active > 0 ? `読み取り中 ${active}件` : "読み取りが終わりました"}
              <span className="ml-2 font-normal text-ink-muted">
                完了 {done}件{problems > 0 ? `・要対応 ${problems}件` : ""}
              </span>
            </p>
            {active === 0 && (
              <button type="button" className="text-xs font-semibold text-ink-muted underline" onClick={() => setItems([])}>
                この表示を消す
              </button>
            )}
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {items.map((i) => (
              <li key={i.key} className="flex items-start gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  {i.state === "done" ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : i.state === "duplicate" ? (
                    <Copy className="h-4 w-4 text-amber-600" />
                  ) : i.state === "error" ? (
                    <AlertTriangle className="h-4 w-4 text-status-danger" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{i.name}</span>
                  <span
                    className={cn(
                      "block text-xs",
                      i.state === "error" ? "text-status-danger" : i.state === "duplicate" ? "text-amber-700" : "text-ink-muted",
                    )}
                  >
                    {i.state === "waiting" && "順番待ち"}
                    {i.state === "uploading" && `送信中 ${Math.round(i.progress * 100)}%`}
                    {i.state === "reading" && "読み取り中…"}
                    {i.state === "done" && "読み取り完了（下の一覧で確認してください）"}
                    {(i.state === "error" || i.state === "duplicate") && i.message}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
