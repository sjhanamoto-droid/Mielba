-- AlterTable
ALTER TABLE "DailyReport" ADD COLUMN     "aiDraft" TEXT;

-- CreateTable
CREATE TABLE "ReportExpense" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReportExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportExpense_reportId_idx" ON "ReportExpense"("reportId");

-- AddForeignKey
ALTER TABLE "ReportExpense" ADD CONSTRAINT "ReportExpense_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
