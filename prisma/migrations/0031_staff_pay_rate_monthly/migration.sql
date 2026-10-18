-- 月給の内訳（社保・賞与月割り・その他）を追加。原価単価は計算で出すため手入力の列は任意に
-- AlterTable
ALTER TABLE "StaffPayRate" ADD COLUMN     "bonusMonthly" INTEGER,
ADD COLUMN     "otherCost" INTEGER,
ADD COLUMN     "socialInsurance" INTEGER,
ALTER COLUMN "costUnitPrice" DROP NOT NULL;

