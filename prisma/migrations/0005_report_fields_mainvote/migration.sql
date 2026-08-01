-- AlterTable
ALTER TABLE "SiteVisit" ADD COLUMN     "mainVote" TEXT;
-- AlterTable
ALTER TABLE "DailyReport" ADD COLUMN     "handoverNone" BOOLEAN,
ADD COLUMN     "stockNote" TEXT,
ADD COLUMN     "stockUsed" BOOLEAN,
ADD COLUMN     "timeChangeReason" TEXT,
ADD COLUMN     "trainFare" INTEGER;
