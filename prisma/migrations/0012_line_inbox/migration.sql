-- AlterTable: LINE取り込み（受信ボックス）用のメタ情報を Photo に追加
ALTER TABLE "Photo" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "lineSenderName" TEXT;

-- CreateTable: LINEボット送信者（合言葉承認制の許可リスト）
CREATE TABLE "LineSender" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineSender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineSender_lineUserId_key" ON "LineSender"("lineUserId");
