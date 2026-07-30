-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "keyboxNoneReason" TEXT,
ADD COLUMN     "keyboxStatus" TEXT,
ADD COLUMN     "provisional" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Site_provisional_idx" ON "Site"("provisional");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
