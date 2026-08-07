-- AlterTable: キーBOX写真が撮れない理由（写真なし時に必須）
ALTER TABLE "Site" ADD COLUMN     "keyboxPhotoNoneReason" TEXT;
