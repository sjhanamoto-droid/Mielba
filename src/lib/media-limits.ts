// 動画アップロードの制約。クライアント（選択時の検証）とサーバー（署名URL発行時の検証）で共有する。
//
// 写真は今まで通り base64 に圧縮して DB に入れるが、動画はサイズが桁違いなので
// Vercel Blob（private ストア）へブラウザから直接アップロードする。
// Vercel の関数はリクエスト/レスポンスとも 4.5MB が上限のため、経由させると必ず失敗する。

/** 動画1本あたりの上限バイト数 */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** 動画1本あたりの上限秒数 */
export const VIDEO_MAX_DURATION_SEC = 30;

/** 画面で案内する推奨の長さ（秒） */
export const VIDEO_RECOMMENDED_DURATION_SEC = 15;

/** 1件（日報・調査など）あたりに添付できる動画の本数 */
export const VIDEO_MAX_COUNT = 3;

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
