// 写真ユーティリティ — 表示URLの生成と、フォーム hidden input（JSON）の検証。
//
// 写真の base64 を RSC ペイロードに載せると本番サイトが重くなるため、
// 一覧表示は GET /api/photos/[id] のURL（photoSrc）で <img loading="lazy"> 参照する。

import {
  formatMb,
  IMAGE_ALLOWED_MIMES,
  IMAGE_MAX_BYTES,
  MEDIA_MAX_COUNT,
  VIDEO_ALLOWED_MIMES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_COUNT,
  VIDEO_MAX_DURATION_SEC,
} from "@/lib/media-limits";

/** 写真の表示URL。thumb=true でサムネイル（無ければAPI側で dataUrl にフォールバック） */
export function photoSrc(id: string, thumb?: boolean): string {
  return "/api/photos/" + id + (thumb ? "?v=thumb" : "");
}

/**
 * フォームから送られる新規ファイル。2種類ある。
 * - 写真・動画: 実体は Vercel Blob に直接アップロード済みで、ここには blobPath だけ来る
 *   （一覧用のサムネイルだけ base64 で本文に乗る）
 * - PDF と旧来の画像: dataUrl（圧縮済み base64）を DB にそのまま入れる
 */
export interface NewPhotoInput {
  dataUrl?: string;
  thumbUrl?: string;
  blobPath?: string;
  mimeType?: string;
  sizeBytes?: number;
  duration?: number;
  caption: string;
  kind: string;
  isVideo: boolean;
  width?: number;
  height?: number;
}

export interface ParsedPhotosField {
  /** 維持する既存写真のID（この配列に無い既存写真は削除対象） */
  kept: string[];
  /** 新規追加する写真 */
  added: NewPhotoInput[];
}

// base64 で DB に入れる（＝Server Action の本文に乗る）ファイルの MIME タイプ。
// 動画はここを通らない（Blob へ直接アップロードし blobPath だけ受け取る）。
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_NEW_PHOTOS = MEDIA_MAX_COUNT;
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024; // 画像1点あたり 2.5MB 相当
// Vercel の関数はリクエスト本文が 4.5MB までで、超えると 413 になる。
// ここで数えるのはデコード後のバイト数だが、実際に送られるのは base64（約1.33倍）なので、
// 3MB = 送信時およそ4MB。他のフォーム項目ぶんの余裕もこれで確保する。
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

// Blob 上のパスは createMediaUploadTarget が作った形だけ許す。
// 認証済みユーザーが任意のパスを差し込んで他人のファイルを紐づけるのを防ぐ。
const BLOB_PATH_RE = /^media\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(mp4|mov|webm|jpg|png|webp)$/;

/** dataUrl の MIME タイプを取り出す（不正なら null） */
function mimeOf(dataUrl: string): string | null {
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(;base64)?,/i.exec(dataUrl);
  return m ? m[1].toLowerCase() : null;
}

/** dataUrl のデコード後バイト数の概算（base64 は 4文字=3バイト） */
function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((body.length * 3) / 4);
}

// アバター画像の検証。クライアントで小さく圧縮（最大256px）してから送る前提だが、
// サーバー側でも形式（画像のみ）とサイズ（デコード後1MBまで）を必ず検証する。
const AVATAR_MAX_BYTES = 1024 * 1024; // 1MB
const AVATAR_ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * アバター画像用 data URL の検証。
 * - "" / undefined → null（画像なし＝色＋イニシャル表示）
 * - 正しい画像 data URL → その文字列
 * - それ以外 → { error }
 */
export function validateAvatarDataUrl(
  value: string | null | undefined,
): string | null | { error: string } {
  const v = (value ?? "").trim();
  if (v === "") return null;
  const mime = mimeOf(v);
  if (!mime || !AVATAR_ALLOWED_MIMES.has(mime)) {
    return { error: "画像はJPEG / PNG / WebP形式のみ対応しています。" };
  }
  if (approxBytes(v) > AVATAR_MAX_BYTES) {
    return { error: "画像サイズが大きすぎます。別の画像でお試しください。" };
  }
  return v;
}

/**
 * hidden input の JSON 配列を検証してパースする。
 * 要素は次のいずれか。
 * - {id}: 既存ファイルを維持する
 * - {dataUrl, thumbUrl?, caption, kind, width?, height?}: 新規の画像・PDF
 * - {blobPath, mimeType, sizeBytes, duration, thumbUrl?, caption, kind, isVideo:true}: 新規の動画
 * 失敗時は日本語のエラーメッセージを返す。
 */
export function parseAndValidatePhotosField(
  json: string,
): ParsedPhotosField | { error: string } {
  if (!json || json.trim() === "") {
    return { kept: [], added: [] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "写真データの形式が不正です。再度お試しください。" };
  }
  if (!Array.isArray(raw)) {
    return { error: "写真データの形式が不正です。再度お試しください。" };
  }

  const kept: string[] = [];
  const added: NewPhotoInput[] = [];
  let totalBytes = 0;
  let videoCount = 0;

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { error: "写真データに不正な項目が含まれています。" };
    }
    const o = item as Record<string, unknown>;

    // 既存ファイルの維持（{id: string}）
    if (
      typeof o.id === "string" &&
      o.id.length > 0 &&
      typeof o.dataUrl !== "string" &&
      typeof o.blobPath !== "string"
    ) {
      kept.push(o.id);
      continue;
    }

    // 動画のサムネイル（先頭フレーム）。画像と同じく base64 で本文に乗る
    const thumbUrl =
      typeof o.thumbUrl === "string" && o.thumbUrl.length > 0 ? o.thumbUrl : undefined;
    if (thumbUrl) {
      const thumbMime = mimeOf(thumbUrl);
      if (!thumbMime || !ALLOWED_MIMES.has(thumbMime)) {
        return { error: "サムネイルの形式が不正です。" };
      }
      totalBytes += approxBytes(thumbUrl);
    }

    const caption = typeof o.caption === "string" ? o.caption : "";
    const kind = typeof o.kind === "string" && o.kind.length > 0 ? o.kind : "WORK";
    const width = typeof o.width === "number" && Number.isFinite(o.width) ? o.width : undefined;
    const height = typeof o.height === "number" && Number.isFinite(o.height) ? o.height : undefined;

    // 新規の写真・動画（実体は Blob にアップロード済み。ここにはパスだけ届く）
    if (typeof o.blobPath === "string" && o.blobPath.length > 0) {
      if (!BLOB_PATH_RE.test(o.blobPath)) {
        return { error: "ファイルの保存先が不正です。選び直して再度お試しください。" };
      }
      const mimeType = typeof o.mimeType === "string" ? o.mimeType.toLowerCase() : "";
      const isVideo = VIDEO_ALLOWED_MIMES.includes(mimeType);
      const isImage = IMAGE_ALLOWED_MIMES.includes(mimeType);
      if (!isVideo && !isImage) {
        return {
          error: "対応していない形式です（写真: JPEG / PNG / WebP、動画: MP4 / MOV / WebM）。",
        };
      }
      const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
      const sizeBytes = typeof o.sizeBytes === "number" ? o.sizeBytes : NaN;
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
        return {
          error: isVideo
            ? `動画のサイズが大きすぎます（1本あたり${formatMb(VIDEO_MAX_BYTES)}まで）。`
            : `写真のサイズが大きすぎます（1枚あたり${formatMb(IMAGE_MAX_BYTES)}まで）。`,
        };
      }

      let duration: number | undefined;
      if (isVideo) {
        duration =
          typeof o.duration === "number" && Number.isFinite(o.duration)
            ? Math.round(o.duration)
            : undefined;
        // 端末側の丸め誤差を見込んで1秒だけ余裕を持たせる
        if (duration !== undefined && duration > VIDEO_MAX_DURATION_SEC + 1) {
          return { error: `動画が長すぎます（1本あたり${VIDEO_MAX_DURATION_SEC}秒まで）。` };
        }
        videoCount += 1;
        if (videoCount > VIDEO_MAX_COUNT) {
          return { error: `動画は${VIDEO_MAX_COUNT}本までです。` };
        }
      }

      added.push({
        blobPath: o.blobPath,
        mimeType,
        sizeBytes,
        duration,
        thumbUrl,
        caption,
        kind,
        isVideo,
        width,
        height,
      });
      if (added.length > MAX_NEW_PHOTOS) {
        return { error: `一度に追加できるのは${MAX_NEW_PHOTOS}件までです。` };
      }
      continue;
    }

    // 新規の画像・PDF
    if (typeof o.dataUrl !== "string" || o.dataUrl.length === 0) {
      return { error: "写真データに不正な項目が含まれています。" };
    }
    const dataUrl = o.dataUrl;

    const mime = mimeOf(dataUrl);
    if (!mime || !ALLOWED_MIMES.has(mime)) {
      return {
        error: "対応していないファイル形式です（JPEG / PNG / WebP / GIF / PDF のみ）。",
      };
    }

    const bytes = approxBytes(dataUrl);
    if (bytes > MAX_IMAGE_BYTES) {
      return { error: "写真のサイズが大きすぎます（1枚あたり2.5MBまで）。" };
    }

    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return {
        error: `追加ファイルの合計サイズが大きすぎます（合計${formatMb(MAX_TOTAL_BYTES)}まで）。先に保存してから続けてください。`,
      };
    }

    added.push({
      dataUrl,
      thumbUrl,
      caption,
      kind,
      isVideo: false,
      width,
      height,
    });

    if (added.length > MAX_NEW_PHOTOS) {
      return { error: `一度に追加できるのは${MAX_NEW_PHOTOS}件までです。` };
    }
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return {
      error: `追加ファイルの合計サイズが大きすぎます（合計${formatMb(MAX_TOTAL_BYTES)}まで）。先に保存してから続けてください。`,
    };
  }

  return { kept, added };
}
