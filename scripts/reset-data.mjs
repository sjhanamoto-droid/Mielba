// 本番データのクリーンリセット（テストデータ全削除、指定ユーザーと会社設定のみ残す）。
//
// 安全のため、実行は環境変数で明示指定する:
//   RESET_DATA_CONFIRM = "YES"                     : これが無ければ何もしない（no-op）
//   RESET_KEEP_EMAILS  = "a@x.com,b@y.com,..."     : 残すユーザーのメール（カンマ区切り）
//
// AppSetting（会社設定）は残す。上記以外のユーザーと、全オペレーションデータを削除する。
// 個人情報（残すメール）はリポジトリに残さず環境変数経由で渡す。使い終わったら env を削除。

import { PrismaClient } from "@prisma/client";

if (process.env.RESET_DATA_CONFIRM !== "YES") {
  console.log("[reset-data] RESET_DATA_CONFIRM!=YES のためスキップします。");
  process.exit(0);
}

const keepEmails = (process.env.RESET_KEEP_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (keepEmails.length === 0) {
  console.error("[reset-data] RESET_KEEP_EMAILS が空です。誤って全ユーザー削除を防ぐため中止します。");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  // 残すユーザーが実在することを確認（安全ガード）
  const kept = await prisma.user.findMany({
    where: { email: { in: keepEmails } },
    select: { email: true },
  });
  console.log(`[reset-data] 残すユーザー: 見つかった ${kept.length} / 指定 ${keepEmails.length}`);
  for (const u of kept) console.log(`   keep: ${u.email}`);
  if (kept.length === 0) {
    console.error("[reset-data] 残すユーザーが1人も見つかりません。誤削除防止のため中止します。");
    process.exit(1);
  }

  // 子 → 親 の順で削除（FK 安全）。AppSetting は対象外（会社設定を残す）。
  const steps = [
    ["EventParticipant", () => prisma.eventParticipant.deleteMany({})],
    ["Comment", () => prisma.comment.deleteMany({})],
    ["MaterialUse", () => prisma.materialUse.deleteMany({})],
    ["ReportExpense", () => prisma.reportExpense.deleteMany({})],
    ["MaterialOrder", () => prisma.materialOrder.deleteMany({})],
    ["NextProcess", () => prisma.nextProcess.deleteMany({})],
    ["Photo", () => prisma.photo.deleteMany({})],
    ["SiteVisit", () => prisma.siteVisit.deleteMany({})],
    ["SiteAssignment", () => prisma.siteAssignment.deleteMany({})],
    ["Handover", () => prisma.handover.deleteMany({})],
    ["SiteRelation", () => prisma.siteRelation.deleteMany({})],
    ["Survey", () => prisma.survey.deleteMany({})],
    ["SitePartner", () => prisma.sitePartner.deleteMany({})],
    ["ContactPerson", () => prisma.contactPerson.deleteMany({})],
    ["Todo", () => prisma.todo.deleteMany({})],
    ["DailyReport", () => prisma.dailyReport.deleteMany({})],
    ["CalendarEvent", () => prisma.calendarEvent.deleteMany({})],
    ["Site", () => prisma.site.deleteMany({})],
    ["Customer", () => prisma.customer.deleteMany({})],
    ["MaterialMaster", () => prisma.materialMaster.deleteMany({})],
    ["User(保持以外)", () => prisma.user.deleteMany({ where: { email: { notIn: keepEmails } } })],
  ];

  for (const [name, fn] of steps) {
    const r = await fn();
    console.log(`  deleted ${name}: ${r.count}`);
  }

  const remainUsers = await prisma.user.count();
  const remainSites = await prisma.site.count();
  console.log(`[reset-data] 完了。残ユーザー ${remainUsers} 名 / 残現場 ${remainSites} 件`);
} catch (e) {
  console.error("[reset-data] エラー:", e?.message ?? e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
