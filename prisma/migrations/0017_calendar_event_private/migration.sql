-- 予定の非公開フラグ。最高管理者(SUPER_ADMIN)が個人予定を登録するとき、
-- 「他の人に表示する / 表示しない」を選べるようにする。
-- 表示しない(true)を選んだ予定は、所有者本人以外の画面には出さない。
-- 既存の予定はすべて従来どおり全員に見える（false）。
ALTER TABLE "CalendarEvent" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
