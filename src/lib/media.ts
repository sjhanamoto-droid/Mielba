// Vercel Blob（private ストア）の読み書き。サーバー専用。
//
// なぜ Blob か: Vercel の関数はリクエスト/レスポンスとも 4.5MB が上限なので、
// 写真をまとめて上げたり動画を Server Action や API 経由で流すと 413 になる。
// アップロードは「署名付き PUT URL をサーバーで作る → ブラウザが Blob へ直接 PUT」、
// 再生は「/api/photos/[id] で認証 → 署名付き GET URL へ 307 リダイレクト」で通す。
// GET はブラウザが CDN を直接叩くので、範囲リクエスト（動画のシーク）もそのまま効く。

import { del, issueSignedToken, list, presignUrl, type IssuedSignedToken } from "@vercel/blob";
import {
  IMAGE_ALLOWED_MIMES,
  IMAGE_MAX_BYTES,
  imageExtFor,
  VIDEO_ALLOWED_MIMES,
  VIDEO_MAX_BYTES,
  videoExtFor,
} from "@/lib/media-limits";

/** アップロードURLの有効時間（現場の回線でも上げ切れる長さ） */
const PUT_URL_TTL_MS = 30 * 60 * 1000;

/** 再生URLの有効時間。短くしすぎると長い動画の途中で切れる */
const GET_URL_TTL_MS = 60 * 60 * 1000;

/** 読み取り用トークンの再利用時間。issueSignedToken は毎回 Blob API を叩くため使い回す */
const READ_TOKEN_TTL_MS = 50 * 60 * 1000;

/**
 * Blob ストアが接続されているか。
 * Vercel 上では OIDC（BLOB_STORE_ID）、ローカルでは BLOB_READ_WRITE_TOKEN を使う。
 * 未接続でもアプリ全体は動く（動画だけ使えない）ようにしたいので、例外ではなく真偽値で返す。
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

// 読み取り用の委譲トークン（ストア全体スコープ）。プロセス内で使い回す。
// 実際に配るURLは presignUrl で1パス・短時間に絞るので、これ自体は外に出ない。
let readToken: { token: IssuedSignedToken; expiresAt: number } | null = null;

async function getReadToken(): Promise<IssuedSignedToken> {
  const now = Date.now();
  if (readToken && readToken.expiresAt > now) return readToken.token;
  const token = await issueSignedToken({
    pathname: "*",
    operations: ["get"],
    validUntil: now + READ_TOKEN_TTL_MS + GET_URL_TTL_MS,
  });
  readToken = { token, expiresAt: now + READ_TOKEN_TTL_MS };
  return token;
}

/** 保存済み写真・動画のURL。ブラウザがこのURLで Blob を直接読む */
export async function signedReadUrl(blobPath: string): Promise<string> {
  const token = await getReadToken();
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname: blobPath,
    access: "private",
    validUntil: Date.now() + GET_URL_TTL_MS,
  });
  return presignedUrl;
}

export interface MediaUploadTarget {
  /** ブラウザが PUT する先 */
  uploadUrl: string;
  /** DB（Photo.blobPath）に保存するパス */
  blobPath: string;
}

/**
 * 写真1枚・動画1本ぶんのアップロード先を用意する。
 *
 * URL は1つのパスに固定され、宣言サイズまでしか書き込めない（超過は CDN が 403 で拒否）。
 * 形式（allowedContentTypes）は署名に含めても単発 PUT では強制されないことを実測で確認済みなので、
 * 拒否の根拠はサイズと「そのパスにしか書けないこと」に置く。パスの形は保存時にも検証する。
 */
export async function createMediaUploadTarget(
  contentType: string,
  sizeBytes: number,
): Promise<MediaUploadTarget | { error: string }> {
  if (!isBlobConfigured()) {
    return { error: "写真・動画の保存先が未設定です。管理者にお問い合わせください。" };
  }
  const isVideo = VIDEO_ALLOWED_MIMES.includes(contentType);
  const isImage = IMAGE_ALLOWED_MIMES.includes(contentType);
  if (!isVideo && !isImage) {
    return { error: "対応していない形式です（写真: JPEG / PNG / WebP、動画: MP4 / MOV / WebM）。" };
  }
  const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    return { error: isVideo ? "動画のサイズが上限を超えています。" : "写真のサイズが上限を超えています。" };
  }

  const ext = isVideo ? videoExtFor(contentType) : imageExtFor(contentType);
  const blobPath = `media/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const validUntil = Date.now() + PUT_URL_TTL_MS;
  // 上限は「その1件の実サイズ」に寄せる。全体上限のままだと、小さいファイルのつもりで
  // 発行したURLで上限いっぱいまで書き込めてしまう。多重化などのわずかな増分だけ許す。
  const maximumSizeInBytes = Math.min(Math.ceil(sizeBytes * 1.05) + 1024, maxBytes);

  const token = await issueSignedToken({
    pathname: blobPath,
    operations: ["put"],
    allowedContentTypes: [contentType],
    maximumSizeInBytes,
    validUntil,
  });

  const { presignedUrl } = await presignUrl(token, {
    operation: "put",
    pathname: blobPath,
    access: "private",
    allowedContentTypes: [contentType],
    maximumSizeInBytes,
    addRandomSuffix: false,
    allowOverwrite: false,
    // 内容は不変（差し替えは新パス）なので CDN に長く置いてよい
    cacheControlMaxAge: 30 * 24 * 60 * 60,
    validUntil,
  });

  return { uploadUrl: presignedUrl, blobPath };
}

/**
 * 写真レコードの削除に合わせて Blob 本体も消す。
 * 消し漏れても課金が少し残るだけなので、失敗しても呼び出し側の処理は止めない。
 */
export async function deleteBlobPaths(paths: string[]): Promise<void> {
  const targets = paths.filter((p) => p.length > 0);
  if (targets.length === 0 || !isBlobConfigured()) return;
  try {
    await del(targets);
  } catch {
    // 孤児 Blob は運用上無害。ここで日報の保存を失敗させない
  }
}

/** Blob を置いているプレフィックス。掃除の対象範囲でもある */
export const MEDIA_PREFIX = "media/";

/**
 * どの写真レコードからも参照されていない Blob を消す。
 * 動画を選んだあと日報を保存せずに離脱すると、Blob だけが残るため定期的に掃除する。
 * アップロード直後の Blob を消さないよう、一定時間より古いものだけを対象にする。
 */
export async function sweepOrphanBlobs(
  referenced: Set<string>,
  minAgeMs: number,
): Promise<number> {
  if (!isBlobConfigured()) return 0;
  const threshold = Date.now() - minAgeMs;
  const orphans: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: MEDIA_PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      if (referenced.has(blob.pathname)) continue;
      if (blob.uploadedAt.getTime() > threshold) continue;
      orphans.push(blob.pathname);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (orphans.length === 0) return 0;
  await deleteBlobPaths(orphans);
  return orphans.length;
}
