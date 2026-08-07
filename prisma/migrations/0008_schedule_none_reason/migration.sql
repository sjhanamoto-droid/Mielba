-- AlterTable: 工程表が無い理由（工程表なし時に必須）
ALTER TABLE "Site" ADD COLUMN     "scheduleNoneReason" TEXT;
