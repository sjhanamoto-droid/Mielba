-- AlterTable: 図面が無い理由（図面なし時に必須）
ALTER TABLE "Site" ADD COLUMN     "drawingNoneReason" TEXT;
