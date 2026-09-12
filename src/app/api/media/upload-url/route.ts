// POST /api/media/upload-url — 写真1枚・動画1本ぶんのアップロード先（署名付き PUT URL）を発行する。
//
// ブラウザはここで受け取ったURLへファイルを直接 PUT する。アプリの関数を通さないので
// Vercel の 4.5MB ボディ上限に引っかからない。形式とサイズの上限は署名に含まれるため、
// クライアントが偽っても CDN 側で弾かれる。

import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createMediaUploadTarget } from "@/lib/media";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }
  const o = (body ?? {}) as Record<string, unknown>;
  const contentType = typeof o.contentType === "string" ? o.contentType.toLowerCase() : "";
  const sizeBytes = typeof o.sizeBytes === "number" ? o.sizeBytes : NaN;

  const target = await createMediaUploadTarget(contentType, sizeBytes);
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: 400 });
  }
  return NextResponse.json(target);
}
