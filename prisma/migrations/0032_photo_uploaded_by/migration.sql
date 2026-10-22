-- 写真・動画の投稿者（現場・現調に直接上げた分。日報・メモの写真は親の投稿者で分かる）。既存分は null
ALTER TABLE "Photo" ADD COLUMN "uploadedById" TEXT;

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
