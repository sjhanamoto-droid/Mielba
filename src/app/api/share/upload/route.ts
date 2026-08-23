// POST /api/share/upload — iOSショートカットからのPDF登録。
//
// LINE等で受け取ったPDFを、共有シートの「Mielbaに登録」ショートカットから
// 現場の図面(DRAWING)・工程表(SCHEDULE)として直接登録する。
// multipart form: file(PDF本体) / site(現場ID) / kind(DRAWING|SCHEDULE)
//
// 上限4MB: Vercelのルートハンドラは約4.5MBのリクエスト上限があるため。
// それを超えるPDFは従来どおり「現場を修正」画面からアップロードする。

import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { shareAuthError } from "../auth";

export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 4 * 1024 * 1024; // 4MB

function bad(message: string, status = 400) {
  // ショートカットは失敗時 error をそのまま通知に出す
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  const authError = shareAuthError(req);
  if (authError) return authError;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("送信データを読み取れませんでした。もう一度お試しください。");
  }

  const file = form.get("file");
  const siteId = form.get("site");
  const kind = form.get("kind");

  if (!(file instanceof File) || file.size === 0) {
    return bad("ファイルが送信されていません。");
  }
  if (typeof siteId !== "string" || siteId === "") {
    return bad("現場が指定されていません。");
  }
  if (kind !== "DRAWING" && kind !== "SCHEDULE") {
    return bad("種別が不正です（図面/工程表）。");
  }
  if (file.size > MAX_PDF_BYTES) {
    return bad(
      "ファイルが大きすぎます（4MBまで）。大きいPDFはMielbaの「現場を修正」から登録してください。",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // PDF判定: MIME（共有経路により octet-stream になることがある）＋ %PDF マジックナンバー
  const looksPdf =
    file.type.includes("pdf") ||
    buffer.subarray(0, 5).toString("latin1").startsWith("%PDF");
  if (!looksPdf) {
    return bad("PDFファイルのみ登録できます。");
  }

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true },
  });
  if (!site) return bad("現場が見つかりません。", 404);

  const caption = (file.name || "").replace(/\.pdf$/i, "").trim() || null;
  try {
    await db.photo.create({
      data: {
        siteId: site.id,
        kind,
        dataUrl: `data:application/pdf;base64,${buffer.toString("base64")}`,
        caption,
      },
    });
  } catch (e) {
    console.error("[share-upload] 保存エラー:", e);
    return bad("保存に失敗しました。時間をおいてもう一度お試しください。", 500);
  }

  revalidatePath(`/sites/${site.id}`);

  const kindLabel = kind === "DRAWING" ? "図面" : "工程表";
  return NextResponse.json({
    ok: true,
    message: `「${caption ?? "PDF"}」を「${site.name}」の${kindLabel}に登録しました`,
  });
}
