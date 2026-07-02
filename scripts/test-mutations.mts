import { PrismaClient } from "@prisma/client";

// 主要ミューテーションのデータ整合性を実DBで検証する（Server Action と同等の Prisma 操作）。
// テスト用の遠い過去日付を使い、終了後に自分が作ったデータを削除する（デモデータ非汚染）。
const db = new PrismaClient();

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.log(`  ❌ ${msg}`); }
}

// persist() 相当: 編集時は id 更新、新規は upsert
async function persistReport(opts: {
  reportId?: string; siteId: string; userId: string; workDate: Date;
  status: string; detail: string;
}) {
  const data = { detail: opts.detail, startTime: "08:00", endTime: "17:00", status: opts.status,
    submittedAt: opts.status === "SUBMITTED" ? new Date() : null };
  let report;
  if (opts.reportId) {
    report = await db.dailyReport.update({ where: { id: opts.reportId }, data: { workDate: opts.workDate, ...data } });
  } else {
    report = await db.dailyReport.upsert({
      where: { siteId_userId_workDate: { siteId: opts.siteId, userId: opts.userId, workDate: opts.workDate } },
      create: { siteId: opts.siteId, userId: opts.userId, workDate: opts.workDate, ...data },
      update: data,
    });
  }
  // writeNested 相当: 子レコード・カレンダーを reportId で作り直す
  await db.materialUse.deleteMany({ where: { reportId: report.id } });
  await db.materialOrder.deleteMany({ where: { reportId: report.id } });
  await db.calendarEvent.deleteMany({ where: { reportId: report.id } });
  await db.materialUse.create({ data: { reportId: report.id, name: "テスト材料", quantity: "1" } });
  const delDate = new Date(opts.workDate); delDate.setDate(delDate.getDate() + 1);
  await db.materialOrder.create({ data: { reportId: report.id, name: "テスト発注", deliveryDate: delDate } });
  if (opts.status === "SUBMITTED") {
    await db.calendarEvent.create({ data: { reportId: report.id, siteId: opts.siteId, title: "テスト材料 配達", date: delDate, source: "DELIVERY" } });
  }
  return report;
}

async function main() {
  const site = await db.site.findFirst({ where: { siteStatus: "ACTIVE" } });
  const user = await db.user.findFirst({ where: { role: "ADMIN" } });
  const surveySite = await db.site.findFirst({ where: { survey: { isNot: null } }, include: { survey: true } });
  if (!site || !user || !surveySite?.survey) throw new Error("seed not found");

  const d1 = new Date("2020-01-15T00:00:00"); // テスト用の遠い過去
  const d2 = new Date("2020-01-16T00:00:00");
  // 念のため既存のテスト残骸を掃除
  await db.dailyReport.deleteMany({ where: { siteId: site.id, userId: user.id, workDate: { in: [d1, d2] } } });

  console.log("\n【1】日報の新規作成＋提出（カレンダー反映）");
  const r1 = await persistReport({ siteId: site.id, userId: user.id, workDate: d1, status: "SUBMITTED", detail: "初回作成" });
  let count = await db.dailyReport.count({ where: { siteId: site.id, userId: user.id, workDate: { in: [d1, d2] } } });
  let events = await db.calendarEvent.count({ where: { reportId: r1.id } });
  assert(count === 1, `日報が1枚作成された（count=${count}）`);
  assert(events === 1, `提出で配達カレンダー予定が生成された（events=${events}）`);

  console.log("\n【2】編集で作業日を変更（HIGH修正: 重複しないこと）");
  const r2 = await persistReport({ reportId: r1.id, siteId: site.id, userId: user.id, workDate: d2, status: "SUBMITTED", detail: "作業日を変更" });
  count = await db.dailyReport.count({ where: { siteId: site.id, userId: user.id, workDate: { in: [d1, d2] } } });
  const sameId = r2.id === r1.id;
  const updated = (await db.dailyReport.findUnique({ where: { id: r1.id } }));
  events = await db.calendarEvent.count({ where: { reportId: r1.id } });
  assert(count === 1, `編集後も日報は1枚のまま（分裂しない, count=${count}）`);
  assert(sameId, `同一レコードが更新された（id不変）`);
  assert(updated?.workDate.getTime() === d2.getTime(), `作業日が更新された（${updated?.workDate.toISOString().slice(0,10)}）`);
  assert(events === 1, `カレンダー予定も重複生成されない（events=${events}）`);

  console.log("\n【3】日報へのコメント");
  const cmt = await db.comment.create({ data: { reportId: r1.id, userId: user.id, body: "テストコメント" } });
  const cmtCount = await db.comment.count({ where: { reportId: r1.id } });
  assert(cmtCount === 1, `コメントが投稿された（count=${cmtCount}）`);

  console.log("\n【4】現調写真（surveyId 紐付け）— HIGH修正");
  const photo = await db.photo.create({ data: { surveyId: surveySite.survey.id, dataUrl: "data:image/svg+xml;base64,TEST", caption: "テスト現調写真", kind: "SURVEY" } });
  const sp = await db.photo.findUnique({ where: { id: photo.id } });
  assert(sp?.surveyId === surveySite.survey.id, `写真が現調(survey)に紐付いた`);
  assert(sp?.reportId === null, `現調写真の reportId は null`);

  console.log("\n【後片付け】テストデータ削除");
  await db.calendarEvent.deleteMany({ where: { reportId: r1.id } });
  await db.comment.deleteMany({ where: { reportId: r1.id } });
  await db.dailyReport.delete({ where: { id: r1.id } }); // 子(material等)はcascade
  await db.photo.delete({ where: { id: photo.id } });
  console.log("  ✅ クリーンアップ完了");

  console.log(`\n────────── ミューテーション検証: ${pass} OK / ${fail} NG ──────────`);
  if (fail > 0) process.exitCode = 1;
  else console.log("🎉 主要ミューテーションのデータ整合性 OK");
}

main().finally(() => db.$disconnect());
