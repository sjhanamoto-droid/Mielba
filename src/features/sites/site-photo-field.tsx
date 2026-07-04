"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2, FileText } from "lucide-react";
import type { PhotoKind } from "@/lib/constants";
import { photoSrc } from "@/lib/photos";

/**
 * 現場フォーム用の kind 固定アップローダー（キーBOX / 図面 / 工程表）。
 * - 既存写真（DB保存済み）: {id} のみ hidden JSON に載せる（base64 を再送しない）
 * - 新規: 画像は圧縮して dataUrl + thumbUrl、PDF は dataUrl のまま（共有契約2の形式）
 * - PDF は width/height を持たない（表示側は width==null を PDF/ファイル扱いにする）
 */

export type SitePhotoInit = {
  id: string;
  caption: string | null;
  isVideo: boolean;
  width: number | null;
};

type Item = {
  id?: string;
  dataUrl?: string;
  thumbUrl?: string;
  caption: string;
  isPdf: boolean;
  width?: number;
  height?: number;
};

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.7;
const THUMB_DIM = 320;
const THUMB_QUALITY = 0.6;
const MAX_PDF_BYTES = 2.5 * 1024 * 1024; // サーバ側の画像系上限（2.5MB）に合わせる
const MAX_TOTAL_BYTES = 11 * 1024 * 1024; // 新規追加分の合計（サーバ側の上限と揃える）

function approxBytes(dataUrl?: string): number {
  if (!dataUrl) return 0;
  const comma = dataUrl.indexOf(",");
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((body.length * 3) / 4);
}

function itemBytes(p: Item): number {
  return approxBytes(p.dataUrl) + approxBytes(p.thumbUrl);
}

function scaleDims(width: number, height: number, max: number): { width: number; height: number } {
  if (width > height && width > max) {
    return { width: max, height: Math.round((height * max) / width) };
  }
  if (height >= width && height > max) {
    return { width: Math.round((width * max) / height), height: max };
  }
  return { width, height };
}

function drawJpeg(img: HTMLImageElement, width: number, height: number, quality: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas error");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** 画像を本体（最大1280px）+ サムネイル（最大320px）に圧縮する */
function compressImage(file: File): Promise<Item> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const main = scaleDims(img.width, img.height, MAX_DIM);
          const dataUrl = drawJpeg(img, main.width, main.height, JPEG_QUALITY);
          const th = scaleDims(img.width, img.height, THUMB_DIM);
          const thumbUrl = drawJpeg(img, th.width, th.height, THUMB_QUALITY);
          resolve({
            dataUrl,
            thumbUrl,
            caption: "",
            isPdf: false,
            width: main.width,
            height: main.height,
          });
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

function readPdf(file: File): Promise<Item> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ dataUrl: reader.result as string, caption: file.name, isPdf: true });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** hidden input に載せるJSON（共有契約2の形式・kind 固定） */
function serialize(items: Item[], kind: PhotoKind): string {
  return JSON.stringify(
    items.map((p) =>
      p.id
        ? { id: p.id }
        : {
            dataUrl: p.dataUrl,
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

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setErrors([]);
    const nextErrors: string[] = [];
    try {
      const processed: Item[] = [];
      let total = items.reduce((sum, p) => sum + itemBytes(p), 0);
      for (const f of files) {
        let item: Item | null = null;
        if (f.type === "application/pdf") {
          if (!allowPdf) {
            nextErrors.push(`${f.name}: この欄にPDFは追加できません`);
            continue;
          }
          if (f.size > MAX_PDF_BYTES) {
            nextErrors.push(`${f.name} はサイズ上限(2.5MB)を超えるため追加できませんでした`);
            continue;
          }
          item = await readPdf(f);
        } else if (f.type.startsWith("image/")) {
          item = await compressImage(f);
        } else {
          nextErrors.push(`${f.name}: 対応していないファイル形式です`);
          continue;
        }
        const bytes = itemBytes(item);
        if (total + bytes > MAX_TOTAL_BYTES) {
          nextErrors.push(
            `${f.name} を追加すると合計サイズが上限(11MB)を超えるため追加できませんでした`,
          );
          continue;
        }
        total += bytes;
        processed.push(item);
      }
      setItems((prev) => [...prev, ...processed]);
    } catch {
      nextErrors.push("ファイルの読み込みに失敗しました。再度お試しください");
    } finally {
      setErrors(nextErrors);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
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
    <div>
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
          const previewSrc = p.id ? photoSrc(p.id, true) : (p.thumbUrl ?? p.dataUrl ?? "");
          return (
            <div key={p.id ?? `new-${i}`} className="relative">
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
        {allowPdf && "PDFは2.5MBまで追加できます。"}
        削除は×を2回タップ。
      </p>
    </div>
  );
}
