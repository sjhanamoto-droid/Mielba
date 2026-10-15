-- 夜勤の申告：本人が「夜勤のため後で書く」を押した時刻。作業日の翌日12時(JST)まで未入力日報ゲートを猶予する
ALTER TABLE "SiteVisit" ADD COLUMN "nightShiftAt" TIMESTAMP(3);
