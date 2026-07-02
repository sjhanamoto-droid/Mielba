"use client";

import { useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHOTO_KIND_LABEL, type PhotoKind } from "@/lib/constants";

export type UploadPhoto = {
  dataUrl: string;
  caption: string;
  kind: PhotoKind;
  isVideo: boolean;
  width?: number;
  height?: number;
};

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.7;

function compressImage(file: File): Promise<UploadPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height >= width && height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas error"));
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve({ dataUrl, caption: "", kind: "WORK", isVideo: false, width, height });
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readVideo(file: File): Promise<UploadPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ dataUrl: reader.result as string, caption: "", kind: "WORK", isVideo: true });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PhotoUploader({
  name = "photos",
  defaultKind = "WORK",
  initial = [],
}: {
  name?: string;
  defaultKind?: PhotoKind;
  initial?: UploadPhoto[];
}) {
  const [photos, setPhotos] = useState<UploadPhoto[]>(initial);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const processed: UploadPhoto[] = [];
      for (const f of files) {
        if (f.type.startsWith("video/")) {
          // 大きすぎる動画はスキップ（デモ DB 保護のため ~8MB 上限）
          if (f.size > 8 * 1024 * 1024) continue;
          const v = await readVideo(f);
          processed.push({ ...v, kind: defaultKind });
        } else if (f.type.startsWith("image/")) {
          const img = await compressImage(f);
          processed.push({ ...img, kind: defaultKind });
        }
      }
      setPhotos((prev) => [...prev, ...processed]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function update(i: number, patch: Partial<UploadPhoto>) {
    setPhotos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function remove(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  const kindCycle: PhotoKind[] = ["WORK", "COMPANY_STOCK", "OTHER"];

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(photos)} />
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
        {photos.map((p, i) => (
          <div key={i} className="group relative">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.isVideo ? (
                <video src={p.dataUrl} className="h-full w-full object-cover" />
              ) : (
                <img src={p.dataUrl} alt="" className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
                aria-label="削除"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  update(i, {
                    kind: kindCycle[(kindCycle.indexOf(p.kind) + 1) % kindCycle.length],
                  })
                }
                aria-label={`写真の種別: ${PHOTO_KIND_LABEL[p.kind]}（タップで切替）`}
                className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white"
              >
                {PHOTO_KIND_LABEL[p.kind]}
              </button>
            </div>
            <input
              value={p.caption}
              onChange={(e) => update(i, { caption: e.target.value })}
              placeholder="説明"
              aria-label="写真の説明"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1 text-[11px] focus:border-brand-400 focus:outline-none"
            />
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
              <span className="text-[11px] font-semibold">写真/動画</span>
            </>
          )}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">
        撮影した写真は自動で軽量化（最大{MAX_DIM}px）してから保存します。タグをタップで「弊社分」等に切替。
      </p>
    </div>
  );
}
