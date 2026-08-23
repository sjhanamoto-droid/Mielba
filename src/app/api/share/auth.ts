// 共有アップロードAPI（iOSショートカット用）の共通認証。
// Authorization: Bearer <SHARE_UPLOAD_TOKEN>（環境変数）で認可する。
// セッションCookieを持たないショートカットからのリクエスト専用（middlewareで除外済み）。

import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

/** 認証NGならエラーレスポンスを返す。OKなら null。 */
export function shareAuthError(req: NextRequest): NextResponse | null {
  const token = process.env.SHARE_UPLOAD_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "共有アップロードが未設定です（SHARE_UPLOAD_TOKEN）" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header);
  const ok =
    expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!ok) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }
  return null;
}
