-- ごみ箱：削除した現場・日報・顧客を30日間戻せるよう、削除直前の行を JSON で保存する
CREATE TABLE "TrashItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "TrashItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrashItem_deletedAt_idx" ON "TrashItem"("deletedAt");
