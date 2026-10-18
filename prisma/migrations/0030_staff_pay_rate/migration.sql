-- 給与・原価単価の履歴（適用開始日つき）。過去の現場原価を変えないため行を足していく
-- CreateTable
CREATE TABLE "StaffPayRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payType" TEXT NOT NULL,
    "payAmount" INTEGER,
    "costUnitPrice" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPayRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffPayRate_userId_effectiveFrom_key" ON "StaffPayRate"("userId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "StaffPayRate" ADD CONSTRAINT "StaffPayRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

