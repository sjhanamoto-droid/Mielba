-- AlterTable: 材料マスターを在庫材料マスターへ転用（在庫数・置き場所を追加）
ALTER TABLE "MaterialMaster" ADD COLUMN     "stockQuantity" INTEGER,
ADD COLUMN     "location" TEXT;

-- CreateTable: 在庫材料の使用（日報 × 在庫材料）
CREATE TABLE "StockUse" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" TEXT,
    "unit" TEXT,
    CONSTRAINT "StockUse_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "StockUse_reportId_idx" ON "StockUse"("reportId");
-- AddForeignKey
ALTER TABLE "StockUse" ADD CONSTRAINT "StockUse_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
