-- 動画を Vercel Blob（private ストア）に置くための列を追加する。
-- Vercel の関数はリクエスト/レスポンスとも 4.5MB が上限のため、動画の実体は
-- base64 として DB には入れられない。Photo には Blob 上のパスだけを持たせる。

-- 動画は dataUrl を持たない（実体は blobPath 側）
ALTER TABLE "Photo" ALTER COLUMN "dataUrl" DROP NOT NULL;

ALTER TABLE "Photo" ADD COLUMN "blobPath" TEXT;
ALTER TABLE "Photo" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Photo" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "Photo" ADD COLUMN "duration" INTEGER;
