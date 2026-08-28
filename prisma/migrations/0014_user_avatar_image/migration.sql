-- スタッフのプロフィール画像（任意）。data URL（軽量JPEG）を保存する。未設定なら色＋イニシャル表示。
ALTER TABLE "User" ADD COLUMN "avatarImage" TEXT;
