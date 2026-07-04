// 写真ユーティリティ — 表示URLの生成と、フォーム hidden input（JSON）の検証。
//
// 写真の base64 を RSC ペイロードに載せると本番サイトが重くなるため、
// 一覧表示は GET /api/photos/[id] のURL（photoSrc）で <img loading="lazy"> 参照する。

/** 写真の表示URL。thumb=true でサムネイル（無ければAPI側で dataUrl にフォールバック） */
export function photoSrc(id: string, thumb?: boolean): string {
  return "/api/photos/" + id + (thumb ? "?v=thumb" : "");
}

/** フォームから送られる新規写真（dataUrl 付き） */
export interface NewPhotoInput {
  dataUrl: string;
  thumbUrl?: string;
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

// 許容する MIME タイプ
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);

const MAX_NEW_PHOTOS = 30;
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024; // 画像1点あたり 2.5MB 相当
const MAX_VIDEO_BYTES = 11 * 1024 * 1024; // 動画1点あたり 11MB
const MAX_TOTAL_BYTES = 11 * 1024 * 1024; // 新規合計 11MB

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

/**
 * hidden input の JSON 配列を検証してパースする。
 * 要素は {id} （既存写真を維持）または {dataUrl, thumbUrl?, caption, kind, isVideo, width?, height?}（新規）。
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

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { error: "写真データに不正な項目が含まれています。" };
    }
    const o = item as Record<string, unknown>;

    // 既存写真の維持（{id: string}）
    if (typeof o.id === "string" && o.id.length > 0 && typeof o.dataUrl !== "string") {
      kept.push(o.id);
      continue;
    }

    // 新規写真
    if (typeof o.dataUrl !== "string" || o.dataUrl.length === 0) {
      return { error: "写真データに不正な項目が含まれています。" };
    }
    const dataUrl = o.dataUrl;

    const mime = mimeOf(dataUrl);
    if (!mime || !ALLOWED_MIMES.has(mime)) {
      return {
        error:
          "対応していないファイル形式です（JPEG / PNG / WebP / GIF / MP4 / MOV / PDF のみ）。",
      };
    }

    const isVideo = o.isVideo === true || mime.startsWith("video/");
    const bytes = approxBytes(dataUrl);

    if (isVideo) {
      if (bytes > MAX_VIDEO_BYTES) {
        return { error: "動画のサイズが大きすぎます（1本あたり11MBまで）。" };
      }
    } else {
      if (bytes > MAX_IMAGE_BYTES) {
        return { error: "写真のサイズが大きすぎます（1枚あたり2.5MBまで）。" };
      }
    }

    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { error: "追加ファイルの合計サイズが大きすぎます（合計11MBまで）。" };
    }

    const thumbUrl = typeof o.thumbUrl === "string" && o.thumbUrl.length > 0 ? o.thumbUrl : undefined;
    if (thumbUrl) {
      const thumbMime = mimeOf(thumbUrl);
      if (!thumbMime || !ALLOWED_MIMES.has(thumbMime)) {
        return { error: "サムネイルの形式が不正です。" };
      }
    }

    added.push({
      dataUrl,
      thumbUrl,
      caption: typeof o.caption === "string" ? o.caption : "",
      kind: typeof o.kind === "string" && o.kind.length > 0 ? o.kind : "WORK",
      isVideo,
      width: typeof o.width === "number" && Number.isFinite(o.width) ? o.width : undefined,
      height: typeof o.height === "number" && Number.isFinite(o.height) ? o.height : undefined,
    });

    if (added.length > MAX_NEW_PHOTOS) {
      return { error: `一度に追加できるのは${MAX_NEW_PHOTOS}枚までです。` };
    }
  }

  return { kept, added };
}
