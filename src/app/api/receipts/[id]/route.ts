// GET /api/receipts/[id] — 領収書の写真・PDF（管理者以上）。
// ?v=thumb で一覧用のサムネイル、それ以外は Blob の署名付きURLへ転送する。

import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { signedReadUrl } from "@/lib/media";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  const { id } = await params;
  const r = await db.receipt.findUnique({
    where: { id },
    select: { blobPath: true, thumbUrl: true },
  });
  if (!r) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  if (req.nextUrl.searchParams.get("v") === "thumb") {
    const m = r.thumbUrl ? /^data:(image\/[a-z]+);base64,(.*)$/s.exec(r.thumbUrl) : null;
    if (!m) return NextResponse.json({ error: "サムネイルがありません" }, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), {
      headers: { "content-type": m[1], "cache-control": "private, max-age=86400" },
    });
  }
  return NextResponse.redirect(await signedReadUrl(r.blobPath), 307);
}
