-- LINE連携（受信ボックス）は不要と判断され撤去。0012 で追加した構造を削除する。
-- データ影響なし: 機能は一度も有効化されておらず（env未設定のままwebhook無効）、
-- LineSender は0件・Photo の2カラムは全行 NULL。

DROP TABLE IF EXISTS "LineSender";

ALTER TABLE "Photo" DROP COLUMN IF EXISTS "fileName";
ALTER TABLE "Photo" DROP COLUMN IF EXISTS "lineSenderName";
