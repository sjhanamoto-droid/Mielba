-- 引き継ぎの既読を人ごとに記録する。
-- これまでは誰か1人が「確認して停止」すると全員から消えていたため、
-- 当日の配員一人ひとりが読んだかを HandoverRead で持つ。Handover.resolvedAt は「対応完了」の意味になる。
CREATE TABLE "HandoverRead" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandoverRead_userId_idx" ON "HandoverRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverRead_handoverId_userId_key" ON "HandoverRead"("handoverId", "userId");

-- AddForeignKey
ALTER TABLE "HandoverRead" ADD CONSTRAINT "HandoverRead_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE CASCADE ON UPDATE CASCADE;
