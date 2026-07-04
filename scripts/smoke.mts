import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const AUTH_SECRET = env.match(/AUTH_SECRET="?([^"\n]+)"?/)?.[1] ?? "";
const secret = new TextEncoder().encode(AUTH_SECRET);
const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3100";

async function mint(userId: string, role: string, name: string) {
  return new SignJWT({ role, name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

// 各ルートで「実際に描画されるべき内容」を positive assert する
async function check(path: string, cookie: string, expect: string[]) {
  const res = await fetch(BASE + path, {
    headers: { Cookie: `mielba_session=${cookie}` },
    redirect: "manual",
  });
  const body = res.status === 200 ? await res.text() : "";
  // 本文の <body>...</body> 内に notFound の主表示が出ていないか（フライト埋め込みは除外して main を見る）
  const mainNotFound = /<h1[^>]*>404<\/h1>|<h2[^>]*>This page could not be found/.test(body);
  const missing = expect.filter((e) => !body.includes(e));
  const ok = res.status === 200 && !mainNotFound && missing.length === 0;
  const mark = ok ? "✅" : "❌";
  console.log(
    `${mark}  ${String(res.status).padEnd(3)} ${path}` +
      (mainNotFound ? "  [404本文]" : "") +
      (missing.length ? `  欠落:[${missing.join(", ")}]` : ""),
  );
  return { path, status: res.status, ok };
}

async function main() {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  const staff = await db.user.findFirst({ where: { email: "sato@mielba.app" } });
  const site = await db.site.findFirst({ where: { siteStatus: "ACTIVE" }, include: { customer: true } });
  const surveySite = await db.site.findFirst({ where: { siteStatus: "SURVEY" } });
  // 認可テスト用: スタッフ(sato)が割り当てられていない進行中現場
  const unassignedSite = await db.site.findFirst({
    where: { siteStatus: "ACTIVE", assignments: { none: { userId: staff!.id } } },
  });
  const customer = await db.customer.findFirst({ where: { sites: { some: {} } } });
  const report = await db.dailyReport.findFirst({ include: { site: true, user: true } });
  const someUser = await db.user.findFirst({ where: { role: "STAFF" } });
  if (!admin || !staff || !site || !customer || !report || !surveySite || !someUser) throw new Error("seed not found");

  const a = await mint(admin.id, admin.role, admin.name);
  const s = await mint(staff.id, staff.role, staff.name);
  const results: { ok: boolean; path: string; status: number }[] = [];

  console.log("\n=== 管理者 ===");
  results.push(await check("/", a, ["次にやること", admin.name]));
  results.push(await check("/customers", a, ["顧客", customer.name]));
  results.push(await check(`/customers/${customer.id}`, a, [customer.name, "この顧客の現場"]));
  results.push(await check(`/customers/${customer.id}/edit`, a, ["顧客名", customer.name]));
  results.push(await check("/customers/new", a, ["顧客名"]));
  results.push(await check("/sites", a, ["現場"]));
  results.push(await check("/sites?status=SURVEY", a, ["現場"]));
  results.push(await check(`/sites/${site.id}`, a, [site.name, "引き継ぎ", "職人", "関連現場", "協力会社"]));
  results.push(await check(`/sites/${site.id}/edit`, a, [site.name]));
  results.push(await check(`/sites/${surveySite.id}/survey`, a, ["キーBOX", "現調写真"]));
  results.push(await check(`/sites/${site.id}/reports`, a, [site.name]));
  results.push(await check("/sites/new", a, ["案件名"]));
  results.push(await check("/calendar", a, ["カレンダー"]));
  results.push(await check("/calendar?ym=2026-07", a, ["カレンダー"]));
  results.push(await check("/calendar?view=week", a, ["カレンダー"]));
  results.push(await check("/calendar?view=day", a, ["カレンダー"]));
  results.push(await check("/todos", a, ["TODO"]));
  results.push(await check("/todos?view=all", a, ["TODO"]));
  results.push(await check(`/reports/${report.id}`, a, [report.user.name, report.site.name]));
  results.push(await check(`/reports/${report.id}/edit`, a, ["作業日", "現場詳細"]));
  results.push(await check(`/reports/new?siteId=${site.id}`, a, [site.name, "現場詳細"]));
  results.push(await check("/reports", a, ["日報", "現場の動き"]));
  results.push(await check("/settings", a, ["設定", "スタッフ管理"]));
  results.push(await check("/settings/staff", a, ["スタッフ管理", admin.name]));
  results.push(await check("/settings/staff/new", a, ["スタッフを追加", "初期パスワード"]));
  results.push(await check(`/settings/staff/${someUser.id}/edit`, a, ["スタッフを編集", someUser.name]));
  results.push(await check("/settings/account", a, ["アカウント設定", "パスワード"]));
  results.push(await check("/settings/app", a, ["会社情報", "既定値"]));
  results.push(await check("/dispatch", a, ["配員", "現場入り"]));

  console.log("\n=== スタッフ ===");
  results.push(await check("/", s, ["次にやること", staff.name]));
  results.push(await check("/reports", s, ["日報", "今日の現場入り"]));
  results.push(await check("/settings", s, ["設定", "アカウント設定"]));
  results.push(await check("/settings/account", s, ["アカウント設定"]));
  results.push(await check(`/sites/${site.id}`, s, [site.name]));
  results.push(await check("/todos", s, ["TODO"]));
  results.push(await check("/calendar", s, ["カレンダー"]));
  results.push(await check(`/reports/new?siteId=${site.id}`, s, [site.name]));

  // 注: (app)/loading.tsx 追加によりページはストリーミング配信となり、
  //     ページ内の redirect()/notFound() は HTTP 200 のままストリーム内で通知される
  //     （リダイレクトは meta refresh + NEXT_REDIRECT、404 は not-found UI）。新仕様として両対応で判定する。
  console.log("\n=== 認可（スタッフは未割当現場を閲覧不可＝404） ===");
  let authzOk = true;
  if (unassignedSite) {
    const r = await fetch(BASE + `/sites/${unassignedSite.id}`, {
      headers: { Cookie: `mielba_session=${s}` },
      redirect: "manual",
    });
    const body = r.status === 200 ? await r.text() : "";
    const streamedNotFound =
      r.status === 200 &&
      body.includes("This page could not be found") &&
      !body.includes(unassignedSite.name); // 現場情報が漏れていないこと
    const ok = r.status === 404 || streamedNotFound;
    authzOk = ok;
    console.log(`${ok ? "✅" : "❌"}  ${r.status} /sites/${unassignedSite.id}（404期待: ${unassignedSite.name}${streamedNotFound ? " / ストリーム内404" : ""}）`);
  } else {
    console.log("⚠️  未割当の進行中現場が無く認可テストをスキップ");
  }

  // 管理者専用ページ: 302/307 またはストリーム内リダイレクト（meta refresh + NEXT_REDIRECT）を許容
  async function checkAdminOnlyRedirect(path: string) {
    const r = await fetch(BASE + path, {
      headers: { Cookie: `mielba_session=${s}` },
      redirect: "manual",
    });
    const body = r.status === 200 ? await r.text() : "";
    const streamedRedirect =
      r.status === 200 && /http-equiv="refresh"/.test(body) && body.includes("NEXT_REDIRECT");
    const ok = r.status === 307 || r.status === 302 || streamedRedirect;
    console.log(`${ok ? "✅" : "❌"}  ${r.status} ${path}（スタッフ→リダイレクト期待${streamedRedirect ? " / ストリーム内リダイレクト" : ""}）`);
    return ok;
  }
  authzOk = (await checkAdminOnlyRedirect("/settings/staff")) && authzOk;
  authzOk = (await checkAdminOnlyRedirect("/dispatch")) && authzOk;

  console.log("\n=== ガード（未ログイン→/login） ===");
  const noauth = await fetch(BASE + "/", { redirect: "manual" });
  const guardOk = noauth.status === 307 || noauth.status === 302;
  console.log(`${guardOk ? "✅" : "❌"}  ${noauth.status} /`);

  const failed = results.filter((r) => !r.ok);
  const allOk = failed.length === 0 && guardOk && authzOk;
  console.log(`\n────────── ${results.length - failed.length}/${results.length} ルートOK / ガード${guardOk ? "OK" : "NG"} / 認可${authzOk ? "OK" : "NG"} ──────────`);
  if (!allOk) process.exitCode = 1;
  else console.log("🎉 全ルート正常 + 認可ガード確認");
}

main().finally(() => db.$disconnect());
