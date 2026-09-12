-- 現場メモに「現調のときに書いたメモか」を持たせる。
-- 現調の登録画面で書いたメモと、現調中の現場に残したメモを、一覧で「現調」と示すため。
-- 既存のメモはすべて施工中のメモとして扱う（false）。
ALTER TABLE "SiteMemo" ADD COLUMN "atSurvey" BOOLEAN NOT NULL DEFAULT false;
