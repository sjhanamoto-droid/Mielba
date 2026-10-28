-- 同じ現場の近い日の予定を「どちらも正しい」と確認した組（重複かもの印を出さない）
-- CreateTable
CREATE TABLE "EventNotDuplicate" (
    "id" TEXT NOT NULL,
    "eventAId" TEXT NOT NULL,
    "eventBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventNotDuplicate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventNotDuplicate_eventBId_idx" ON "EventNotDuplicate"("eventBId");

-- CreateIndex
CREATE UNIQUE INDEX "EventNotDuplicate_eventAId_eventBId_key" ON "EventNotDuplicate"("eventAId", "eventBId");

-- AddForeignKey
ALTER TABLE "EventNotDuplicate" ADD CONSTRAINT "EventNotDuplicate_eventAId_fkey" FOREIGN KEY ("eventAId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventNotDuplicate" ADD CONSTRAINT "EventNotDuplicate_eventBId_fkey" FOREIGN KEY ("eventBId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

