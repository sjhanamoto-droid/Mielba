-- 領収書の明細に補助科目（MFの借方補助科目）を持たせる
-- AlterTable
ALTER TABLE "ReceiptLine" ADD COLUMN     "subAccount" TEXT;

