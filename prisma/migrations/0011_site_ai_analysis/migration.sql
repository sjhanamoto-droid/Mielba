-- AlterTable: 現場にAI分析（人工超過・工事完了）の結果を保持する
ALTER TABLE "Site" ADD COLUMN     "overrunAnalysis" TEXT,
ADD COLUMN     "overrunAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "completionAnalysis" TEXT,
ADD COLUMN     "completionAnalyzedAt" TIMESTAMP(3);
