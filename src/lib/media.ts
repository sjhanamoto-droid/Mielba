// Vercel Blob（private ストア）の読み書き。サーバー専用。
//
// なぜ Blob か: Vercel の関数はリクエスト/レスポンスとも 4.5MB が上限なので、
// 写真をまとめて上げたり動画を Server Action や API 経由で流すと 413 になる。
// アップロードは「署名付き PUT URL をサーバーで作る → ブラウザが Blob へ直接 PUT」、
// 再生は「/api/photos/[id] で認証 → 署名付き GET URL へ 307 リダイレクト」で通す。
// GET はブラウザが CDN を直接叩くので、範囲リクエスト（動画のシーク）もそのまま効く。

import {
  BlobNotFoundError,
  copy,
  del,
  head,
  issueSignedToken,
  list,
  presignUrl,
  type IssuedSignedToken,
} from "@vercel/blob";
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

/** ごみ箱のプレフィックス。消した Blob は trash/<元のパス> に30日置いてから完全削除する */
export const TRASH_PREFIX = "trash/";
/** ごみ箱に置く期間 */
export const TRASH_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 写真レコードの削除に合わせて Blob 本体も消す（すぐには消さず、ごみ箱へ移す）。
 * 2026-10-09 の誤削除を受け、消す前に必ず trash/ へコピーし、コピーできたものだけ元を消す。
 * 30日以内なら restoreBlobPaths で元のパスへ戻せる。
 * 消し漏れても課金が少し残るだけなので、失敗しても呼び出し側の処理は止めない。
 */
export async function deleteBlobPaths(paths: string[]): Promise<void> {
  const targets = paths.filter((p) => p.length > 0 && !p.startsWith(TRASH_PREFIX));
  if (targets.length === 0 || !isBlobConfigured()) return;
  const moved: string[] = [];
  for (const p of targets) {
    try {
      await copy(p, TRASH_PREFIX + p, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      moved.push(p);
    } catch (e) {
      // 元が既に無い（BlobNotFound）ものは消す必要もない。それ以外のコピー失敗は元を残す
      if (!(e instanceof BlobNotFoundError)) console.error("[media] ごみ箱へのコピー失敗:", p, e);
    }
  }
  if (moved.length === 0) return;
  try {
    await del(moved);
  } catch {
    // 孤児 Blob は運用上無害。ここで日報の保存を失敗させない
  }
}

/**
 * ごみ箱から元のパスへ戻す（ごみ箱からの復元・事故時の復旧に使う）。
 * 戻せた件数を返す。ごみ箱に無いもの（30日超で完全削除済み等）は飛ばす。
 */
export async function restoreBlobPaths(paths: string[]): Promise<number> {
  if (!isBlobConfigured()) return 0;
  let restored = 0;
  for (const p of paths.filter((x) => x.length > 0)) {
    try {
      await copy(TRASH_PREFIX + p, p, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 30 * 24 * 60 * 60,
      });
      restored++;
    } catch (e) {
      if (!(e instanceof BlobNotFoundError)) console.error("[media] ごみ箱からの復元失敗:", p, e);
    }
  }
  return restored;
}

/** ごみ箱で30日を過ぎた Blob を完全に削除する（本番の cron からのみ） */
export async function purgeBlobTrash(maxAgeMs = TRASH_KEEP_MS): Promise<number> {
  if (!isBlobConfigured() || process.env.VERCEL_ENV !== "production") return 0;
  const threshold = Date.now() - maxAgeMs;
  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: TRASH_PREFIX, cursor, limit: 1000 });
    for (const b of page.blobs) {
      // copy で作った時刻＝ごみ箱に入れた時刻
      if (b.uploadedAt.getTime() < threshold) old.push(b.pathname);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (old.length > 0) await del(old);
  return old.length;
}

// 2026-10-09 の誤った一括削除で、これ以前に上げた写真・動画の本体（Blob）が失われた。
// パスの日付フォルダ（media/YYYY-MM-DD/）がこの日以前のものだけ、本体が残っているかを確かめる。
const LOST_UNTIL_DAY = "2026-10-08";
const missingPaths = new Set<string>();

/** 失われた可能性がある日付の Blob か（それ以外は確認せず残っている前提で扱う） */
export function mayBeLostBlob(blobPath: string): boolean {
  const m = /^media\/(\d{4}-\d{2}-\d{2})\//.exec(blobPath);
  return !!m && m[1] <= LOST_UNTIL_DAY;
}

/** Blob 本体が残っているか。無いと分かったパスはプロセス内で覚えて問い合わせを省く */
export async function blobExists(blobPath: string): Promise<boolean> {
  if (missingPaths.has(blobPath)) return false;
  try {
    await head(blobPath);
    return true;
  } catch (e) {
    if (e instanceof BlobNotFoundError) {
      missingPaths.add(blobPath);
      return false;
    }
    // 通信エラー等は「ある」とみなして従来どおり本体へ転送する
    return true;
  }
}

/** Blob を置いているプレフィックス。掃除の対象範囲でもある */
export const MEDIA_PREFIX = "media/";

/**
 * どの写真レコードからも参照されていない Blob を消す。
 * 動画を選んだあと日報を保存せずに離脱すると、Blob だけが残るため定期的に掃除する。
 * アップロード直後の Blob を消さないよう、一定時間より古いものだけを対象にする。
 */
/** 掃除で一度に消してよい上限。これを超える候補が出たら異常とみなして消さない */
const SWEEP_MAX_COUNT = 20;
const SWEEP_MAX_RATIO = 0.05;

export type SweepResult = {
  /** ごみ箱へ移した件数 */
  deleted: number;
  /** 候補が多すぎて中止したときの候補数（中止していなければ 0） */
  blocked: number;
  /** 掃除対象のプレフィックス内の総数 */
  total: number;
};

export async function sweepOrphanBlobs(
  referenced: Set<string>,
  minAgeMs: number,
): Promise<SweepResult> {
  const none = { deleted: 0, blocked: 0, total: 0 };
  if (!isBlobConfigured()) return none;
  // 本番以外（ローカル・プレビュー）では絶対に消さない。ローカルの DB は本番の動画を参照していないため、
  // 本番の Blob トークンで走らせると本番の動画を「参照なし」と誤判定して全部消してしまう。
  if (process.env.VERCEL_ENV !== "production") return none;
  const threshold = Date.now() - minAgeMs;
  const orphans: string[] = [];
  let total = 0;
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: MEDIA_PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      total++;
      if (referenced.has(blob.pathname)) continue;
      if (blob.uploadedAt.getTime() > threshold) continue;
      orphans.push(blob.pathname);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (orphans.length === 0) return { deleted: 0, blocked: 0, total };
  // 一度に大量（20件超 or 全体の5%超）に消そうとしたら、設定や DB の取り違えを疑って中止する
  // （数件の置き去りは日常的に出るので、割合の判定は5件を超えたときだけ）
  if (
    orphans.length > SWEEP_MAX_COUNT ||
    (orphans.length > 5 && orphans.length > total * SWEEP_MAX_RATIO)
  ) {
    return { deleted: 0, blocked: orphans.length, total };
  }
  await deleteBlobPaths(orphans);
  return { deleted: orphans.length, blocked: 0, total };
}
