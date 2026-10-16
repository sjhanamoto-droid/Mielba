-- 現場担当者（自社）。null＝未定。元請側の担当者（siteContactName）とは別
ALTER TABLE "Site" ADD COLUMN "assigneeId" TEXT;

ALTER TABLE "Site" ADD CONSTRAINT "Site_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
