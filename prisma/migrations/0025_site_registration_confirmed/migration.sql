-- 管理者が仮登録から本登録にした現場（必須項目が欠けていても以後は仮登録に戻さない）
ALTER TABLE "Site" ADD COLUMN "registrationConfirmed" BOOLEAN NOT NULL DEFAULT false;
