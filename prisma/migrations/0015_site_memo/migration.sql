-- 現場メモ（SiteMemo）: 日報以外の気づき・連絡を、投稿者・日時つきで時系列に残す。
-- CreateTable
CREATE TABLE "SiteMemo" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteMemo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteMemo_siteId_createdAt_idx" ON "SiteMemo"("siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteMemo" ADD CONSTRAINT "SiteMemo_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMemo" ADD CONSTRAINT "SiteMemo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 旧 Site.memo（現場修正フォームの単一メモ）を最初の現場メモとして引き継ぐ。
-- 投稿者＝現場の作成者、日時＝現場の最終更新日時。Site.memo 列は互換のため残す（以後は更新しない）。
INSERT INTO "SiteMemo" ("id", "siteId", "content", "createdById", "createdAt", "updatedAt")
SELECT 'legacy_' || "id", "id", btrim("memo", E' \t\r\n　'), "createdById", "updatedAt", "updatedAt"
FROM "Site"
WHERE "memo" IS NOT NULL AND btrim("memo", E' \t\r\n　') <> '';
