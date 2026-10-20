"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2, FileText } from "lucide-react";
import type { PhotoKind } from "@/lib/constants";
import { photoSrc } from "@/lib/photos";
import { readLocalCopy, uploadToBlob } from "@/lib/blob-upload";
import { formatMb, PDF_MAX_BYTES, PDF_MIME, SITE_DOC_MAX_COUNT } from "@/lib/media-limits";

/**
 * 現場フォーム用の kind 固定アップローダー（キーBOX / 図面 / 工程表）。
 * - 既存写真（DB保存済み）: {id} のみ hidden JSON に載せる（本体を再送しない）
 * - 新規: 選んだ時点で Vercel Blob へ直接アップロードし、blobPath だけを hidden JSON に載せる。
 *   画像は圧縮してから上げ、一覧用サムネイル（thumbUrl）だけ base64 で添える。PDF はそのまま上げる。
 *   フォーム送信が 4.5MB 上限に当たらないので、大きな図面PDFも扱える。
 * - PDF は width/height を持たない（表示側は width==null を PDF/ファイル扱いにする）
 * - アップロード中は data-site-upload-busy を付ける（親フォームが送信を止めるため）
 */

export type SitePhotoInit = {
  id: string;
  caption: string | null;
  isVideo: boolean;
  width: number | null;
};

type Item = {
  id?: string;
  blobPath?: string;
  mimeType?: string;
  sizeBytes?: number;
  thumbUrl?: string;
  caption: string;
  isPdf: boolean;
  width?: number;
  height?: number;
};

type Uploading = { key: number; name: string; ratio: number };

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.7;
const THUMB_DIM = 320;
const THUMB_QUALITY = 0.6;

function scaleDims(width: number, height: number, max: number): { width: number; height: number } {
  if (width > height && width > max) {
    return { width: max, height: Math.round((height * max) / width) };
  }
  if (height >= width && height > max) {
    return { width: Math.round((width * max) / height), height: max };
  }
  return { width, height };
}

function drawCanvas(img: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas error");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality);
  });
}

type CompressedImage = { body: Blob; thumbUrl: string; width: number; height: number };

/** 画像を本体（最大1280px の JPEG）+ サムネイル（最大320px の dataUrl）に圧縮する */
function compressImage(file: File): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        const main = scaleDims(img.width, img.height, MAX_DIM);
        const body = await toJpegBlob(drawCanvas(img, main.width, main.height), JPEG_QUALITY);
        const th = scaleDims(img.width, img.height, THUMB_DIM);
        const thumbUrl = drawCanvas(img, th.width, th.height).toDataURL("image/jpeg", THUMB_QUALITY);
        resolve({ body, thumbUrl, width: main.width, height: main.height });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** PDF か（iPhone の「ファイル」から選ぶと type が空のことがあるので拡張子でも見る） */
function looksLikePdf(file: File): boolean {
  return file.type === PDF_MIME || (file.type === "" && file.name.toLowerCase().endsWith(".pdf"));
}

/** hidden input に載せるJSON（kind 固定。サーバー側は parseAndValidatePhotosField で検証） */
function serialize(items: Item[], kind: PhotoKind): string {
  return JSON.stringify(
    items.map((p) =>
      p.id
        ? { id: p.id }
        : {
            blobPath: p.blobPath,
            mimeType: p.mimeType,
            sizeBytes: p.sizeBytes,
            thumbUrl: p.thumbUrl,
            caption: p.caption,
            kind,
            isVideo: false,
            width: p.width,
            height: p.height,
          },
    ),
  );
}

export function SitePhotoField({
  name,
  kind,
  allowPdf = false,
  initial = [],
  buttonLabel = "写真を追加",
}: {
  name: string;
  kind: PhotoKind;
  allowPdf?: boolean;
  initial?: SitePhotoInit[];
  buttonLabel?: string;
}) {
  const [items, setItems] = useState<Item[]>(
    initial.map((p) => ({
      id: p.id,
      caption: p.caption ?? "",
      // 動画は現場直付けでは想定しないが、既存データはファイル扱いで維持する
      isPdf: !p.isVideo && p.width == null,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  // 削除の誤タップ対策: 1タップ目で確認状態、2タップ目で確定
  const [confirming, setConfirming] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  /** 1件を Blob へ上げ、一覧に足す1件を返す */
  async function processFile(f: File, onProgress: (ratio: number) => void): Promise<Item | { error: string }> {
    if (looksLikePdf(f)) {
      if (!allowPdf) return { error: `${f.name}: この欄にPDFは追加できません` };
      if (f.size > PDF_MAX_BYTES) {
        return {
          error: `${f.name} は${formatMb(f.size)}あり、上限の${formatMb(PDF_MAX_BYTES)}を超えるため追加できませんでした`,
        };
      }
      const local = await readLocalCopy(f, PDF_MIME);
      if ("error" in local) return local;
      const up = await uploadToBlob(local.body, PDF_MIME, f.name, onProgress);
      if ("error" in up) return up;
      return { blobPath: up.blobPath, mimeType: PDF_MIME, sizeBytes: f.size, caption: f.name, isPdf: true };
    }
    if (f.type.startsWith("image/")) {
      let image: CompressedImage;
      try {
        image = await compressImage(f);
      } catch {
        return { error: `${f.name} を読み込めませんでした。別の画像でお試しください` };
      }
      const up = await uploadToBlob(image.body, "image/jpeg", f.name, onProgress);
      if ("error" in up) return up;
      return {
        blobPath: up.blobPath,
        mimeType: "image/jpeg",
        sizeBytes: image.body.size,
        thumbUrl: image.thumbUrl,
        caption: "",
        isPdf: false,
        width: image.width,
        height: image.height,
      };
    }
    return { error: `${f.name}: 対応していないファイル形式です` };
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setErrors([]);
    const nextErrors: string[] = [];
    try {
      // 件数はサーバー側と同じく既存＋新規で数え、超える分は上げる前に断る
      let count = items.length;
      for (const [i, f] of files.entries()) {
        if (count >= SITE_DOC_MAX_COUNT) {
          nextErrors.push(`1つの欄に追加できるのは${SITE_DOC_MAX_COUNT}件までです（${f.name} は追加していません）`);
          continue;
        }
        const key = Date.now() + i;
        setUploading((prev) => [...prev, { key, name: f.name, ratio: 0 }]);
        const result = await processFile(f, (ratio) =>
          setUploading((prev) => prev.map((u) => (u.key === key ? { ...u, ratio } : u))),
        ).catch(() => ({ error: `${f.name} の追加に失敗しました。再度お試しください` }));
        setUploading((prev) => prev.filter((u) => u.key !== key));
        if ("error" in result) {
          nextErrors.push(result.error);
          continue;
        }
        count += 1;
        // 1件ずつ足す（途中で失敗しても、上がった分は残す）
        setItems((prev) => [...prev, result]);
      }
    } finally {
      setErrors(nextErrors);
      setUploading([]);
      setBusy(false);
    }
  }

  function updateCaption(i: number, caption: string) {
    setItems((prev) => prev.map((p, idx) => (idx === i ? { ...p, caption } : p)));
  }

  function onDeleteTap(i: number) {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (confirming === i) {
      setItems((prev) => prev.filter((_, idx) => idx !== i));
      setConfirming(null);
      return;
    }
    setConfirming(i);
    confirmTimer.current = setTimeout(() => setConfirming(null), 3000);
  }

  return (
    <div data-site-upload-busy={busy ? "1" : undefined}>
      <input type="hidden" name={name} value={serialize(items, kind)} />
      <input
        ref={inputRef}
        type="file"
        accept={allowPdf ? "image/*,application/pdf" : "image/*"}
        multiple
        className="hidden"
        onChange={onFiles}
      />

      <div className="grid grid-cols-3 gap-2">
        {items.map((p, i) => {
          const previewSrc = p.id ? photoSrc(p.id, true) : (p.thumbUrl ?? "");
          return (
            <div key={p.id ?? p.blobPath ?? `new-${i}`} className="relative">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-sunken">
                {p.isPdf ? (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-muted">
                    <FileText className="h-8 w-8" />
                    <span className="text-[10px] font-bold">PDF</span>
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onDeleteTap(i)}
                  aria-label={confirming === i ? "タップで削除を確定" : "削除"}
                  className={
                    confirming === i
                      ? "absolute right-1 top-1 z-10 flex h-7 items-center justify-center rounded-full bg-red-600 px-2.5 text-[11px] font-bold text-white before:absolute before:-inset-2 before:content-['']"
                      : "absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white before:absolute before:-inset-2 before:content-['']"
                  }
                >
                  {confirming === i ? "削除?" : <X className="h-4 w-4" />}
                </button>
              </div>
              <input
                value={p.caption}
                onChange={(e) => updateCaption(i, e.target.value)}
                placeholder="説明"
                aria-label="ファイルの説明"
                readOnly={!!p.id}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1 text-[11px] focus:border-brand-400 focus:outline-none"
              />
            </div>
          );
        })}

        {uploading.map((u) => (
          <div key={u.key}>
            <div className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-sunken px-2 text-ink-muted">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-[11px] font-bold tabular-nums">{Math.round(u.ratio * 100)}%</span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${Math.round(u.ratio * 100)}%` }} />
              </div>
            </div>
            <p className="mt-1 truncate px-1 text-[11px] text-ink-faint">{u.name}</p>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong bg-surface-subtle text-ink-muted active:scale-95"
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <Camera className="h-6 w-6" />
              <span className="text-[11px] font-semibold">{buttonLabel}</span>
            </>
          )}
        </button>
      </div>

      {errors.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {errors.map((msg, i) => (
            <li key={i} className="text-[11px] font-medium text-red-600 dark:text-red-400">
              {msg}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-[11px] text-ink-faint">
        画像は自動で軽量化（最大{MAX_DIM}px）してから保存します。
        {allowPdf && `PDFは1件${formatMb(PDF_MAX_BYTES).replace(".0MB", "MB")}まで。`}
        {SITE_DOC_MAX_COUNT}件まで追加できます。削除は×を2回タップ。
      </p>
    </div>
  );
}
