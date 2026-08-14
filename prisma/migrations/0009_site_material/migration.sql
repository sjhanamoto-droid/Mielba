-- CreateTable
CREATE TABLE "SiteMaterial" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" TEXT,
    "unit" TEXT,
    "unitPrice" INTEGER,
    "amount" INTEGER,
    "documentType" TEXT,
    "supplier" TEXT,
    "orderedAt" TIMESTAMP(3),
    "photoId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteMaterial_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "SiteMaterial_siteId_active_idx" ON "SiteMaterial"("siteId", "active");
-- AddForeignKey
ALTER TABLE "SiteMaterial" ADD CONSTRAINT "SiteMaterial_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
