"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2, Play } from "lucide-react";
import { PHOTO_KIND_LABEL, type PhotoKind } from "@/lib/constants";
import { photoSrc } from "@/lib/photos";

/**
 * アップローダーが扱う写真。
 * - 既存写真（DB保存済み）: id のみ保持（base64 を再送しない。プレビューは photoSrc(id, true)）
 * - 新規写真: dataUrl（+ 画像は thumbUrl）を保持
 */
export type UploaderPhoto = {
  id?: string;
  dataUrl?: string;
  thumbUrl?: string;
  caption: string;
  kind: PhotoKind;
  isVideo: boolean;
  width?: number;
  height?: number;
};

/** 後方互換エイリアス（既存の呼び出し側は UploadPhoto を import している） */
export type UploadPhoto = UploaderPhoto;

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.7;
const THUMB_DIM = 320;
const THUMB_QUALITY = 0.6;
const MAX_VIDEO_BYTES = 8 * 1024 * 1024; // 動画1本あたり 8MB
const MAX_TOTAL_BYTES = 11 * 1024 * 1024; // 新規追加分の合計 11MB（サーバ側の上限と揃える）

/** dataUrl のデコード後バイト数の概算（base64 は 4文字=3バイト） */
function approxBytes(dataUrl?: string): number {
  if (!dataUrl) return 0;
  const comma = dataUrl.indexOf(",");
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((body.length * 3) / 4);
}

/** 1枚あたりの送信ペイロード概算 */
function photoBytes(p: UploaderPhoto): number {
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
function compressImage(file: File): Promise<UploaderPhoto> {
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
            kind: "WORK",
            isVideo: false,
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

function readVideo(file: File): Promise<UploaderPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ dataUrl: reader.result as string, caption: "", kind: "WORK", isVideo: true });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** hidden input に載せるJSON。既存={id}のみ、新規=dataUrl等（共有契約の形式） */
function serialize(photos: UploaderPhoto[]): string {
  return JSON.stringify(
    photos.map((p) =>
      p.id
        ? { id: p.id }
        : {
            dataUrl: p.dataUrl,
            thumbUrl: p.thumbUrl,
            caption: p.caption,
            kind: p.kind,
            isVideo: p.isVideo,
            width: p.width,
            height: p.height,
          },
    ),
  );
}

export function PhotoUploader({
  name = "photos",
  defaultKind = "WORK",
  initial = [],
}: {
  name?: string;
  defaultKind?: PhotoKind;
  initial?: UploaderPhoto[];
}) {
  const [photos, setPhotos] = useState<UploaderPhoto[]>(initial);
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
      const processed: UploaderPhoto[] = [];
      // 既に保持している新規分の合計から積み上げる
      let total = photos.reduce((sum, p) => sum + photoBytes(p), 0);
      for (const f of files) {
        let item: UploaderPhoto | null = null;
        if (f.type.startsWith("video/")) {
          // 大きすぎる動画は追加せず、理由を明示する
          if (f.size > MAX_VIDEO_BYTES) {
            nextErrors.push(`${f.name} はサイズ上限(8MB)を超えるため追加できませんでした`);
            continue;
          }
          item = { ...(await readVideo(f)), kind: defaultKind };
        } else if (f.type.startsWith("image/")) {
          item = { ...(await compressImage(f)), kind: defaultKind };
        } else {
          continue;
        }
        // 合計ペイロード概算が上限を超える追加はブロック
        const bytes = photoBytes(item);
        if (total + bytes > MAX_TOTAL_BYTES) {
          nextErrors.push(
            `${f.name} を追加すると合計サイズが上限(11MB)を超えるため追加できませんでした。先に保存するか、他のファイルを削除してください`,
          );
          continue;
        }
        total += bytes;
        processed.push(item);
      }
      setPhotos((prev) => [...prev, ...processed]);
    } catch {
      nextErrors.push("ファイルの読み込みに失敗しました。再度お試しください");
    } finally {
      setErrors(nextErrors);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function update(i: number, patch: Partial<UploaderPhoto>) {
    setPhotos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function onDeleteTap(i: number) {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (confirming === i) {
      // 2タップ目: 確定
      setPhotos((prev) => prev.filter((_, idx) => idx !== i));
      setConfirming(null);
      return;
    }
    // 1タップ目: 確認状態（3秒で自動解除）
    setConfirming(i);
    confirmTimer.current = setTimeout(() => setConfirming(null), 3000);
  }

  const kindCycle: PhotoKind[] = ["WORK", "COMPANY_STOCK", "OTHER"];

  return (
    <div>
      <input type="hidden" name={name} value={serialize(photos)} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={onFiles}
      />

      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => {
          // 既存はAPIサムネイル、新規は生成済み thumbUrl（動画は dataUrl）
          const previewSrc = p.id ? photoSrc(p.id, true) : (p.thumbUrl ?? p.dataUrl ?? "");
          return (
            <div key={p.id ?? `new-${i}`} className="group relative">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-sunken">
                {p.isVideo ? (
                  p.dataUrl ? (
                    <video src={p.dataUrl} className="h-full w-full object-cover" preload="metadata" />
                  ) : (
                    // 既存動画は本体を読み込まずプレースホルダ表示
                    <span className="flex h-full w-full items-center justify-center text-ink-muted">
                      <Play className="h-8 w-8" />
                    </span>
                  )
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
                {p.id ? (
                  // 既存写真は {id} 参照のみ送るため種別変更不可（静的表示）
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white">
                    {PHOTO_KIND_LABEL[p.kind]}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      update(i, {
                        kind: kindCycle[(kindCycle.indexOf(p.kind) + 1) % kindCycle.length],
                      })
                    }
                    aria-label={`写真の種別: ${PHOTO_KIND_LABEL[p.kind]}（タップで切替）`}
                    className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white before:absolute before:-inset-2.5 before:content-['']"
                  >
                    {PHOTO_KIND_LABEL[p.kind]}
                  </button>
                )}
              </div>
              <input
                value={p.caption}
                onChange={(e) => update(i, { caption: e.target.value })}
                placeholder="説明"
                aria-label="写真の説明"
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
              <span className="text-[11px] font-semibold">写真/動画</span>
            </>
          )}
        </button>
      </div>

      {errors.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {errors.map((msg, i) => (
            <li key={i} className="text-[11px] font-medium text-red-600">
              {msg}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-[11px] text-ink-faint">
        撮影した写真は自動で軽量化（最大{MAX_DIM}px）してから保存します。タグをタップで「弊社分」等に切替。削除は×を2回タップ。
      </p>
    </div>
  );
}
