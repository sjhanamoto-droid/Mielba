-- 日報の「現場不参加」（休み・体調不良など）。稼働時間・人工には計上しない。
ALTER TABLE "DailyReport" ADD COLUMN "absent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DailyReport" ADD COLUMN "absenceReason" TEXT;
