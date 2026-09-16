"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2, Play, AlertTriangle } from "lucide-react";
import { PHOTO_KIND_LABEL, type PhotoKind } from "@/lib/constants";
import { photoSrc } from "@/lib/photos";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatMb,
  looksLikeVideo,
  videoMimeFromName,
  IMAGE_MAX_BYTES,
  MEDIA_MAX_COUNT,
  VIDEO_ALLOWED_MIMES,
  VIDEO_COMPAT_RISK_MIMES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_COUNT,
  VIDEO_MAX_DURATION_SEC,
  VIDEO_RECOMMENDED_DURATION_SEC,
} from "@/lib/media-limits";

/**
 * アップローダーが扱うファイル。
 * - 既存（DB保存済み）: id のみ保持（本体を再送しない。プレビューは photoSrc(id, true)）
 * - 新規の写真・動画: 先に Vercel Blob へ直接アップロードし、blobPath と
 *   一覧用サムネイル（thumbUrl）だけを保持する
 * - dataUrl は旧経路（現場フォームの図面・工程表など、少数のファイル）だけが使う
 */
export type UploaderPhoto = {
  id?: string;
  dataUrl?: string;
  thumbUrl?: string;
  blobPath?: string;
  mimeType?: string;
  sizeBytes?: number;
  duration?: number;
  caption: string;
  kind: PhotoKind;
  isVideo: boolean;
  width?: number;
  height?: number;
};

/** 後方互換エイリアス（既存の呼び出し側は UploadPhoto を import している） */
export type UploadPhoto = UploaderPhoto;

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.72;
// サムネイルだけがフォーム本文に乗る。50枚でも収まるよう小さめにする（1枚およそ15KB）。
const THUMB_DIM = 288;
const THUMB_QUALITY = 0.55;
// Vercel の関数はリクエスト本文が 4.5MB までなので、base64 で送る分はここで頭打ちにする。
// 写真・動画の本体は Blob へ直接上げるので、ここに乗るのはサムネイルだけ。
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

/** dataUrl のデコード後バイト数の概算（base64 は 4文字=3バイト） */
function approxBytes(dataUrl?: string): number {
  if (!dataUrl) return 0;
  const comma = dataUrl.indexOf(",");
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((body.length * 3) / 4);
}

/** 1件あたりの送信ペイロード概算（動画は本文に乗らないのでサムネイルぶんだけ） */
function photoBytes(p: UploaderPhoto): number {
  return approxBytes(p.dataUrl) + approxBytes(p.thumbUrl);
}

/** 秒を「0:08」形式にする */
function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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

function drawJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas error");
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

type CompressedImage = {
  /** Blob へ上げる本体（軽量化済みJPEG） */
  body: Blob;
  /** 一覧用サムネイル（base64。フォーム本文に乗る） */
  thumbUrl: string;
  width: number;
  height: number;
};

/** canvas を JPEG の Blob にする（本体は base64 にせず、そのまま Blob へ上げる） */
function toJpegBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("canvas error"));
      return;
    }
    ctx.drawImage(source, 0, 0, width, height);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas error"))),
      "image/jpeg",
      quality,
    );
  });
}

/** 画像を本体（最大1600px・Blob行き）+ サムネイル（最大288px・base64）に圧縮する */
function compressImage(file: File): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const main = scaleDims(img.width, img.height, MAX_DIM);
        const th = scaleDims(img.width, img.height, THUMB_DIM);
        try {
          const thumbUrl = drawJpeg(img, th.width, th.height, THUMB_QUALITY);
          toJpegBlob(img, main.width, main.height, JPEG_QUALITY)
            .then((body) =>
              resolve({ body, thumbUrl, width: main.width, height: main.height }),
            )
            .catch(reject);
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

type VideoMeta = {
  duration: number;
  width: number;
  height: number;
  /** 先頭フレームのサムネイル。端末が描画を許さない場合は undefined */
  thumbUrl?: string;
};

/**
 * 動画の長さ・寸法を読み、可能なら先頭フレームをサムネイルにする。
 * サムネイルは一覧を軽くするためのもので、取れなくても投稿は続行する。
 */
function readVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    let settled = false;

    const finish = (meta: VideoMeta) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(meta);
    };

    // 端末によっては seek/描画が終わらないことがあるので、待ちすぎない
    const timer = setTimeout(() => {
      finish({
        duration: video.duration || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });
    }, 8000);

    video.onloadedmetadata = () => {
      const base: VideoMeta = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      // 真っ黒になりにくい位置へ寄せる
      const seekTo = Math.min(0.2, (video.duration || 1) / 2);
      video.onseeked = () => {
        clearTimeout(timer);
        try {
          const th = scaleDims(video.videoWidth, video.videoHeight, THUMB_DIM);
          finish({ ...base, thumbUrl: drawJpeg(video, th.width, th.height, THUMB_QUALITY) });
        } catch {
          finish(base);
        }
      };
      try {
        video.currentTime = seekTo;
      } catch {
        clearTimeout(timer);
        finish(base);
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error("video read error"));
    };

    video.src = url;
  });
}

/** 進捗つきで Blob へ直接 PUT する（fetch では進捗が取れないので XHR を使う） */
function putWithProgress(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // 署名に含めた形式と一致させる（ここがずれると CDN 側で弾かれる）
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(file);
  });
}

/**
 * hidden input（または Server Action の引数）に載せるJSON。既存={id}のみ、新規は画像/動画で形が違う。
 * サーバー側は parseAndValidatePhotosField でこの形を検証する。
 */
export function serializeUploaderPhotos(photos: UploaderPhoto[]): string {
  return JSON.stringify(
    photos.map((p) => {
      if (p.id) return { id: p.id };
      if (p.blobPath) {
        return {
          blobPath: p.blobPath,
          mimeType: p.mimeType,
          sizeBytes: p.sizeBytes,
          duration: p.duration,
          thumbUrl: p.thumbUrl,
          caption: p.caption,
          kind: p.kind,
          isVideo: p.isVideo,
          width: p.width,
          height: p.height,
        };
      }
      return {
        dataUrl: p.dataUrl,
        thumbUrl: p.thumbUrl,
        caption: p.caption,
        kind: p.kind,
        isVideo: false,
        width: p.width,
        height: p.height,
      };
    }),
  );
}

/** 親から選択中のファイルを操作するためのハンドル（controlRef 経由） */
export type PhotoUploaderHandle = {
  /** 保存が済んだ分（blobPath）を一覧から外す。アップロード中のものはそのまま続く */
  remove: (blobPaths: string[]) => void;
};

export function PhotoUploader({
  name = "photos",
  defaultKind = "WORK",
  initial = [],
  variant = "default",
  maxCount = MEDIA_MAX_COUNT,
  addLabel = "写真・動画を添付",
  disabled = false,
  controlRef,
  onChange,
  onBusyChange,
}: {
  name?: string;
  defaultKind?: PhotoKind;
  initial?: UploaderPhoto[];
  /** compact で未選択のときに出すボタンの文言 */
  addLabel?: string;
  /** 親が保存中など、新しいファイルを選ばせたくないあいだ true */
  disabled?: boolean;
  /** 親から remove() を呼ぶためのハンドル置き場 */
  controlRef?: React.MutableRefObject<PhotoUploaderHandle | null>;
  /**
   * compact: 現場メモなど「本文に添える」用途。種別タグ・説明欄は出さず、
   * 未選択のあいだは小さな「写真・動画を添付」ボタンだけにして入力欄を圧迫しない。
   */
  variant?: "default" | "compact";
  /** 写真・動画の合計点数の上限（サーバー側の検証と同じ値を渡す。超える分は上げる前に断る） */
  maxCount?: number;
  /** 選択中のファイルが変わるたびに呼ぶ（フォーム外から Server Action に渡す用途） */
  onChange?: (photos: UploaderPhoto[]) => void;
  /** 圧縮・アップロード中かどうか（親の送信ボタンを無効化するため） */
  onBusyChange?: (busy: boolean) => void;
}) {
  const compact = variant === "compact";
  const [photos, setPhotos] = useState<UploaderPhoto[]>(initial);
  const [busy, setBusy] = useState(false);
  // 親へ通知するコールバックは最新のものを ref 経由で呼ぶ（依存配列に入れて毎回発火させない）。
  // ref の更新は描画中ではなく commit 後に行う（この effect を先に宣言しておくと、下の通知より先に走る）
  const onChangeRef = useRef(onChange);
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onBusyChangeRef.current = onBusyChange;
  });
  useEffect(() => {
    onChangeRef.current?.(photos);
  }, [photos]);
  useEffect(() => {
    onBusyChangeRef.current?.(busy);
  }, [busy]);
  // 親からの操作（保存済み分の取り外し）。作り直し（key 変更）せずに済むので、アップロード中の分を巻き込まない
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      remove: (blobPaths) => {
        const targets = new Set(blobPaths);
        setPhotos((prev) => prev.filter((p) => !(p.blobPath && targets.has(p.blobPath))));
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef]);
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  // アップロード中の動画（完了した時点で photos に入る）
  const [uploading, setUploading] = useState<{ name: string; ratio: number }[]>([]);
  // サムネイルを出せなかったタイル（既存の動画でサムネ未生成のものなど）
  const [thumbFailed, setThumbFailed] = useState<string[]>([]);
  // 削除の誤タップ対策: 1タップ目で確認状態、2タップ目で確定
  const [confirming, setConfirming] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  /** 動画1本を検証してBlobへ上げる。成功したら追加用の1件を返す */
  /** Blob のアップロード先を取り、本体を直接 PUT する（写真・動画で共通） */
  async function uploadToBlob(
    body: Blob,
    contentType: string,
    label: string,
    onProgress: (ratio: number) => void,
  ): Promise<{ blobPath: string } | { error: string }> {
    const res = await fetch("/api/media/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType, sizeBytes: body.size }),
    });
    if (!res.ok) {
      const info = (await res.json().catch(() => null)) as { error?: string } | null;
      return { error: info?.error ?? `${label} のアップロードを開始できませんでした` };
    }
    const { uploadUrl, blobPath } = (await res.json()) as {
      uploadUrl: string;
      blobPath: string;
    };
    try {
      await putWithProgress(uploadUrl, body, contentType, onProgress);
    } catch {
      return { error: `${label} のアップロードに失敗しました。電波の良い場所で再度お試しください` };
    }
    return { blobPath };
  }

  /** 写真1枚：軽量化して Blob へ上げ、サムネイルだけフォームに載せる */
  async function processImage(
    file: File,
    onProgress: (ratio: number) => void,
  ): Promise<UploaderPhoto | { error: string }> {
    let image: CompressedImage;
    try {
      image = await compressImage(file);
    } catch {
      return { error: `${file.name} を読み込めませんでした。別の写真でお試しください` };
    }
    if (image.body.size > IMAGE_MAX_BYTES) {
      return { error: `${file.name} は${formatMb(image.body.size)}あり、上限を超えます` };
    }
    const up = await uploadToBlob(image.body, "image/jpeg", file.name, onProgress);
    if ("error" in up) return up;
    return {
      blobPath: up.blobPath,
      mimeType: "image/jpeg",
      sizeBytes: image.body.size,
      thumbUrl: image.thumbUrl,
      caption: "",
      kind: defaultKind,
      isVideo: false,
      width: image.width,
      height: image.height,
    };
  }

  async function processVideo(
    file: File,
    onProgress: (ratio: number) => void,
  ): Promise<UploaderPhoto | { error: string } | { notice: string }> {
    // Android の一部ブラウザは File.type を空で返すので拡張子で補う
    const mime = (file.type || videoMimeFromName(file.name)).toLowerCase();
    if (!VIDEO_ALLOWED_MIMES.includes(mime)) {
      return { error: `${file.name} は対応していない動画形式です（MP4 / MOV / WebM のみ）` };
    }
    if (file.size > VIDEO_MAX_BYTES) {
      return {
        error: `${file.name} は${formatMb(file.size)}あり、上限の${formatMb(VIDEO_MAX_BYTES)}を超えます。${VIDEO_RECOMMENDED_DURATION_SEC}秒くらいで撮り直してください`,
      };
    }

    let meta: VideoMeta;
    try {
      meta = await readVideoMeta(file);
    } catch {
      return { error: `${file.name} を読み込めませんでした。別の動画でお試しください` };
    }
    if (meta.duration > VIDEO_MAX_DURATION_SEC + 1) {
      return {
        error: `${file.name} は${Math.round(meta.duration)}秒あり、上限の${VIDEO_MAX_DURATION_SEC}秒を超えます。短く撮り直してください`,
      };
    }

    const up = await uploadToBlob(file, mime, file.name, onProgress);
    if ("error" in up) return up;

    return {
      blobPath: up.blobPath,
      mimeType: mime,
      sizeBytes: file.size,
      duration: Math.round(meta.duration),
      thumbUrl: meta.thumbUrl,
      caption: "",
      kind: defaultKind,
      isVideo: true,
      width: meta.width || undefined,
      height: meta.height || undefined,
    };
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setErrors([]);
    setNotices([]);
    const nextErrors: string[] = [];
    const nextNotices: string[] = [];

    try {
      // 既に保持している新規分の合計から積み上げる
      let total = photos.reduce((sum, p) => sum + photoBytes(p), 0);
      let videoCount = photos.filter((p) => p.isVideo).length;
      let count = photos.length;

      for (const f of files) {
        if (looksLikeVideo(f)) {
          if (count >= maxCount) {
            nextErrors.push(`写真・動画は合計${maxCount}件までです（${f.name} は追加していません）`);
            continue;
          }
          if (videoCount >= VIDEO_MAX_COUNT) {
            nextErrors.push(`動画は${VIDEO_MAX_COUNT}本までです（${f.name} は追加していません）`);
            continue;
          }
          // iPhone の「高効率」設定で撮った .mov は Android/PC で再生できないことがある
          const risky = (f.type || videoMimeFromName(f.name)).toLowerCase();
          if (VIDEO_COMPAT_RISK_MIMES.includes(risky)) {
            nextNotices.push(
              "この動画は形式の都合で、iPhone以外の端末で再生できないことがあります。iPhoneの「設定 > カメラ > フォーマット」を「互換性優先」にすると確実です",
            );
          }

          const label = f.name;
          setUploading((prev) => [...prev, { name: label, ratio: 0 }]);
          const result = await processVideo(f, (ratio) => {
            setUploading((prev) => prev.map((u) => (u.name === label ? { ...u, ratio } : u)));
          });
          setUploading((prev) => prev.filter((u) => u.name !== label));

          if ("error" in result) {
            nextErrors.push(result.error);
            continue;
          }
          if ("notice" in result) continue;
          videoCount += 1;
          count += 1;
          total += photoBytes(result);
          setPhotos((prev) => [...prev, result]);
          continue;
        }

        if (!f.type.startsWith("image/")) {
          // PDF などを選んでも黙って落とさず、何が起きたか伝える
          nextErrors.push(`${f.name} は写真・動画ではないため追加していません`);
          continue;
        }

        if (count >= maxCount) {
          nextErrors.push(`写真・動画は合計${maxCount}件までです（${f.name} は追加していません）`);
          continue;
        }

        const label = f.name;
        setUploading((prev) => [...prev, { name: label, ratio: 0 }]);
        const item = await processImage(f, (ratio) => {
          setUploading((prev) => prev.map((u) => (u.name === label ? { ...u, ratio } : u)));
        });
        setUploading((prev) => prev.filter((u) => u.name !== label));

        if ("error" in item) {
          nextErrors.push(item.error);
          continue;
        }
        const bytes = photoBytes(item);
        if (total + bytes > MAX_TOTAL_BYTES) {
          nextErrors.push(
            `${f.name} を追加すると一度に保存できる量を超えます。先に保存してから続けてください`,
          );
          continue;
        }
        total += bytes;
        count += 1;
        setPhotos((prev) => [...prev, item]);
      }
    } catch {
      nextErrors.push("ファイルの読み込みに失敗しました。再度お試しください");
    } finally {
      setErrors(nextErrors);
      setNotices(nextNotices);
      setBusy(false);
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
      {/* フォーム送信用。compact（Server Action に onChange で渡す用途）では DOM に載せない */}
      {!compact && <input type="hidden" name={name} value={serializeUploaderPhotos(photos)} />}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onFiles}
      />

      {compact && photos.length === 0 && uploading.length === 0 ? (
        /* 未選択のあいだはボタンだけ（メモ入力欄を大きなグリッドで圧迫しない） */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
          className={buttonClass({ variant: "outline", size: "sm" })}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
          {addLabel}
        </button>
      ) : (
      <div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-3")}>
        {photos.map((p, i) => {
          // 既存はAPIサムネイル、新規は生成済み thumbUrl
          const key = p.id ?? p.blobPath ?? `new-${i}`;
          const previewSrc = p.id ? photoSrc(p.id, true) : (p.thumbUrl ?? p.dataUrl ?? "");
          // サムネイルが無い動画は再生アイコンにする（本体を落としに行かせない）
          const showPlaceholder = p.isVideo && (!previewSrc || thumbFailed.includes(key));
          return (
            <div key={key} className="group relative">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-sunken">
                {showPlaceholder ? (
                  <span className="flex h-full w-full items-center justify-center text-ink-muted">
                    <Play className="h-8 w-8" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setThumbFailed((prev) => (prev.includes(key) ? prev : [...prev, key]))}
                    className="h-full w-full object-cover"
                  />
                )}
                {p.isVideo && !showPlaceholder && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Play className="h-7 w-7 text-white drop-shadow" />
                  </span>
                )}
                {p.isVideo && p.duration ? (
                  <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {formatDuration(p.duration)}
                  </span>
                ) : null}
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
                {compact ? null : p.id ? (
                  // 既存は {id} 参照のみ送るため種別変更不可（静的表示）
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
                    aria-label={`種別: ${PHOTO_KIND_LABEL[p.kind]}（タップで切替）`}
                    className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white before:absolute before:-inset-2.5 before:content-['']"
                  >
                    {PHOTO_KIND_LABEL[p.kind]}
                  </button>
                )}
              </div>
              {!compact && (
                <input
                  value={p.caption}
                  onChange={(e) => update(i, { caption: e.target.value })}
                  placeholder="説明"
                  aria-label="説明"
                  readOnly={!!p.id}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1 text-[11px] focus:border-brand-400 focus:outline-none"
                />
              )}
            </div>
          );
        })}

        {uploading.map((u) => (
          <div key={u.name} className="relative">
            <div className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-surface-subtle px-2">
              <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
              <span className="text-[11px] font-bold text-ink-muted">
                {Math.round(u.ratio * 100)}%
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.round(u.ratio * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
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
      )}

      {errors.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {errors.map((msg, i) => (
            <li key={i} className="text-[11px] font-medium text-red-600">
              {msg}
            </li>
          ))}
        </ul>
      )}

      {notices.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {notices.map((msg, i) => (
            <li key={i} className="flex gap-1 text-[11px] font-medium text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{msg}</span>
            </li>
          ))}
        </ul>
      )}

      {compact ? (
        (photos.length > 0 || uploading.length > 0) && (
          <p className="mt-1.5 text-[11px] text-ink-faint">
            写真は自動で軽量化します。写真・動画あわせて{maxCount}件まで。
            動画は{VIDEO_MAX_DURATION_SEC}秒・{formatMb(VIDEO_MAX_BYTES)}まで。削除は×を2回タップ。
          </p>
        )
      ) : (
        <p className="mt-1.5 text-[11px] text-ink-faint">
          写真は自動で軽量化（最大{MAX_DIM}px）します。写真・動画あわせて{maxCount}件まで。
          動画は{VIDEO_MAX_DURATION_SEC}秒・{formatMb(VIDEO_MAX_BYTES)}まで、{VIDEO_MAX_COUNT}本まで
          （{VIDEO_RECOMMENDED_DURATION_SEC}秒くらいが目安）。
          タグをタップで「弊社分」等に切替。削除は×を2回タップ。
        </p>
      )}
    </div>
  );
}
