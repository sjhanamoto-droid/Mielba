import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// 認証ガード。未ログインは /login へ、ログイン済みで /login に来たらホームへ。
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Vercel Cron は Bearer CRON_SECRET、LINE Webhook は X-Line-Signature（HMAC）で
  // それぞれ自前認証する（セッション Cookie を持たない）ため、セッションガードの対象外とする。
  // 認可は各ルート側（/api/cron/* は CRON_SECRET、/api/line/* は署名検証）で行う。
  if (pathname.startsWith("/api/cron/") || pathname.startsWith("/api/line/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const isLoginPage = pathname === "/login";

  if (!session && !isLoginPage) {
    // API（写真配信等）は HTML へリダイレクトせず 401 を返す（<img> やスクリプトからの参照のため）
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (session && isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // _next, 静的アセット, favicon, PWA アセット（manifest / sw.js / icons）等を除外
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|apple-touch-icon.png|logo.png|icon.svg|apple-icon.png|robots.txt).*)",
  ],
};
