-- 現場メモに写真・動画を添付できるようにする。
-- 実体は日報と同じく Vercel Blob（blobPath）に置き、Photo にはメモへの参照だけ持たせる。
-- メモを消せば添付も消える（CASCADE）。参照されなくなった Blob は日次の掃除で消える。
ALTER TABLE "Photo" ADD COLUMN "memoId" TEXT;

-- CreateIndex
CREATE INDEX "Photo_memoId_idx" ON "Photo"("memoId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "SiteMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
