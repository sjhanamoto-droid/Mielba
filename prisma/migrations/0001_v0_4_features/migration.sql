-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "finalManDays" INTEGER,
ADD COLUMN     "keyboxNumber" TEXT,
ADD COLUMN     "keyboxPlace" TEXT,
ADD COLUMN     "siteContactPhone" TEXT,
ADD COLUMN     "targetManDays" INTEGER;

-- AlterTable
ALTER TABLE "DailyReport" ADD COLUMN     "handover" TEXT,
ADD COLUMN     "parkingFee" INTEGER;

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "siteId" TEXT,
ADD COLUMN     "thumbUrl" TEXT;

-- CreateTable
CREATE TABLE "MaterialMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "reportId" TEXT,
    "content" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialMaster_active_sortOrder_idx" ON "MaterialMaster"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "Handover_siteId_idx" ON "Handover"("siteId");

-- CreateIndex
CREATE INDEX "Handover_resolvedAt_idx" ON "Handover"("resolvedAt");

-- CreateIndex
CREATE INDEX "Handover_siteId_resolvedAt_idx" ON "Handover"("siteId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Photo_siteId_idx" ON "Photo"("siteId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

