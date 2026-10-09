-- 日報の「次回の作業日」。未定なら確認日を持ち、その日に通知＋全画面で決めさせる。
ALTER TABLE "DailyReport" ADD COLUMN "nextWorkChoice" TEXT;
ALTER TABLE "DailyReport" ADD COLUMN "nextWorkDate" TIMESTAMP(3);
ALTER TABLE "DailyReport" ADD COLUMN "nextCheckDate" TIMESTAMP(3);
ALTER TABLE "DailyReport" ADD COLUMN "nextCheckResolvedAt" TIMESTAMP(3);
