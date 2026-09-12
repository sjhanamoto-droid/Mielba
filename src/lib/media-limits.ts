// 写真・動画アップロードの制約。クライアント（選択時の検証）とサーバー（署名URL発行時の検証）で共有する。
//
// 写真も動画も Vercel Blob（private ストア）へブラウザから直接アップロードする。
// Vercel の関数はリクエスト/レスポンスとも 4.5MB が上限のため、本体を経由させると
// 枚数が増えた時点で必ず失敗する。フォーム送信に載せるのは一覧用の小さなサムネイルだけ。

/** 動画1本あたりの上限バイト数（1分の1080p動画で概ね60〜100MB） */
export const VIDEO_MAX_BYTES = 150 * 1024 * 1024;

/** 動画1本あたりの上限秒数（1分程度＋撮影の余裕） */
export const VIDEO_MAX_DURATION_SEC = 90;

/** 画面で案内する推奨の長さ（秒） */
export const VIDEO_RECOMMENDED_DURATION_SEC = 60;

/** 1件（日報・現調など）あたりに添付できる動画の本数 */
export const VIDEO_MAX_COUNT = 6;

/** 写真1枚あたりの上限バイト数（軽量化後。通常は0.3MB前後） */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** 1件あたりに添付できる写真・動画の合計点数 */
export const MEDIA_MAX_COUNT = 60;

/** Blob へ直接上げる画像の形式（アップローダーが JPEG に変換してから送る） */
export const IMAGE_ALLOWED_MIMES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** MIME からファイル拡張子を決める（Blob 上のパス生成用） */
export function imageExtFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** 受け付ける動画の MIME タイプ */
export const VIDEO_ALLOWED_MIMES: readonly string[] = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

/** iPhone の「高効率」設定で撮ると HEVC の .mov になり、Android/PC で再生できないことがある */
export const VIDEO_COMPAT_RISK_MIMES: readonly string[] = ["video/quicktime"];

/** MIME からファイル拡張子を決める（Blob 上のパス生成用） */
export function videoExtFor(mime: string): string {
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  return "mp4";
}

/**
 * ファイル名から動画の MIME タイプを推測する。
 * Android の一部ブラウザは File.type を空で返すため、拡張子で補う。
 */
export function videoMimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "";
}

/** 動画として扱うファイルかどうか（MIME が空の端末は拡張子で判定する） */
export function looksLikeVideo(file: { type: string; name: string }): boolean {
  return file.type.toLowerCase().startsWith("video/") || videoMimeFromName(file.name) !== "";
}

/** バイト数を「12.3MB」形式にする（エラーメッセージ用） */
export function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}
