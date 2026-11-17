// GET /api/receipts/exports/[id] — 出力した回の CSV（MF の仕訳インポート形式）をダウンロードする。
// テンプレートと同じ Shift_JIS（Windows の cp932）で返す。何度ダウンロードしても同じ内容。

import { type NextRequest, NextResponse } from "next/server";
import iconv from "iconv-lite";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  const { id } = await params;
  const exp = await db.receiptExport.findUnique({
    where: { id },
    select: { csv: true, fileName: true },
  });
  if (!exp) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const body = iconv.encode(exp.csv, "cp932");
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": "text/csv; charset=Shift_JIS",
      "content-disposition": `attachment; filename="receipts.csv"; filename*=UTF-8''${encodeURIComponent(exp.fileName)}`,
      "cache-control": "no-store",
    },
  });
}
