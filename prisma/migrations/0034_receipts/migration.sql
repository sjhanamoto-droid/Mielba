-- 領収書読み取り（MF会計へ取り込むCSVを作る）：領収書・明細・出力した回
-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "blobPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "fileHash" TEXT,
    "fileName" TEXT,
    "receiptDate" TEXT,
    "vendor" TEXT,
    "invoiceNumber" TEXT,
    "totalAmount" INTEGER,
    "creditAccount" TEXT NOT NULL DEFAULT '現金',
    "description" TEXT,
    "ocrModel" TEXT,
    "ocrRaw" TEXT,
    "ocrError" TEXT,
    "uploadedById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "exportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "taxCategory" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptExport" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "csv" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_receiptDate_idx" ON "Receipt"("receiptDate");

-- CreateIndex
CREATE INDEX "Receipt_exportId_idx" ON "Receipt"("exportId");

-- CreateIndex
CREATE INDEX "Receipt_fileHash_idx" ON "Receipt"("fileHash");

-- CreateIndex
CREATE INDEX "ReceiptLine_receiptId_idx" ON "ReceiptLine"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptExport_seq_key" ON "ReceiptExport"("seq");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "ReceiptExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

