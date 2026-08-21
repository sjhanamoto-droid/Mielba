// GET /api/photos/[id] — 写真・動画のバイナリ配信ルート。
//
// Photo.dataUrl(base64) を RSC ペイロードに載せるとページが数MB〜数十MBになるため、
// 表示側は photoSrc(id) のURLで <img loading="lazy"> 参照し、実体はここから配信する。
// ?v=thumb でサムネイル（thumbUrl。無ければ dataUrl にフォールバック）。

import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

/** 'data:<mime>;base64,<data>' をパースする（不正なら null） */
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.*)$/is.exec(dataUrl);
  if (!m) return null;
  try {
    return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 認証必須（写真は社内情報のため未認証には返さない）
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;
  const wantThumb = req.nextUrl.searchParams.get("v") === "thumb";
  // ?dl=1 でダウンロード（Content-Disposition: attachment）。モバイル/PWAでは
  // インライン表示だと保存・印刷の手段が無いため、明示的な保存導線に使う。
  const wantDownload = req.nextUrl.searchParams.get("dl") === "1";
  const rawName = req.nextUrl.searchParams.get("name") ?? "";

  const photo = await db.photo.findUnique({
    where: { id },
    select: { dataUrl: true, thumbUrl: wantThumb },
  });
  if (!photo) {
    return NextResponse.json({ error: "写真が見つかりません" }, { status: 404 });
  }

  // サムネイル指定時は thumbUrl を優先し、無ければ dataUrl にフォールバック
  const source = (wantThumb && photo.thumbUrl) || photo.dataUrl;
  const parsed = parseDataUrl(source);
  if (!parsed) {
    return NextResponse.json({ error: "写真データが不正です" }, { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": parsed.mime,
    "Content-Length": String(parsed.buffer.byteLength),
    // 写真は不変（編集時は新IDで再作成）なので長期キャッシュ。認証必須のため private。
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  if (wantDownload) {
    // ファイル名: ?name= を採用（制御文字・引用符・パス区切りは除去）。日本語は filename* で渡す
    const ext = parsed.mime === "application/pdf" ? ".pdf" : "";
    const safe = rawName.replace(/[\r\n"\\/]/g, "").trim().slice(0, 80) || `file-${id}`;
    const fileName = safe.endsWith(ext) ? safe : safe + ext;
    headers["Content-Disposition"] =
      `attachment; filename="download${ext}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }

  return new NextResponse(new Uint8Array(parsed.buffer), { status: 200, headers });
}
