// 読み取り専用の日付診断。指定期間の CalendarEvent と SiteVisit を、現場(siteId)紐づけ・
// 参加者つきで一覧する。「予定はあるのに配員(現場入り)に出ない」原因（＝現場未紐づけ／
// 休み等）を切り分ける用途。書き込みは一切しない。
//
// 実行: FROM=2026-09-01 TO=2026-09-08 node scripts/diagnose-date.mjs

import { PrismaClient } from "@prisma/client";

const NON_WORK = new Set(["HOLIDAY", "OTHER", "OFFICE"]);
const from = (process.env.FROM || "2026-09-01").trim();
const to = (process.env.TO || "2026-09-08").trim();
const prisma = new PrismaClient();

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const rangeStart = new Date(`${from}T00:00:00.000Z`);
const rangeEnd = new Date(`${to}T23:59:59.999Z`);

try {
  console.log(`[diag-date] 期間: ${from} 〜 ${to}（UTC基準の表示）`);

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const events = await prisma.calendarEvent.findMany({
    where: { date: { gte: rangeStart, lte: rangeEnd } },
    select: {
      id: true, title: true, source: true, category: true, siteId: true, date: true,
      allDay: true, startTime: true, endTime: true,
      site: { select: { name: true, siteStatus: true } },
      participants: { select: { userId: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  console.log(`\n[diag-date] CalendarEvent: ${events.length} 件`);
  for (const e of events) {
    const who = e.participants.map((p) => nameOf.get(p.userId) ?? p.userId).join(",") || "なし";
    const time = e.allDay ? "終日" : `${e.startTime ?? "--"}-${e.endTime ?? "--"}`;
    const siteLabel = e.siteId
      ? `現場:${e.site?.name ?? "?"}(${e.site?.siteStatus ?? "?"})`
      : "現場:なし(件名のみ)";
    const cat = e.category ?? "－";
    const makesVisit = e.siteId && !NON_WORK.has(e.category) ? "→配員に出る想定" : "→配員に出ない";
    console.log(`   ${iso(e.date)} [${cat}] 「${e.title}」 ${time} ${siteLabel} 参加:${who} ${makesVisit}`);
  }

  const visits = await prisma.siteVisit.findMany({
    where: { date: { gte: rangeStart, lte: rangeEnd } },
    select: { date: true, userId: true, site: { select: { name: true, siteStatus: true } } },
    orderBy: { date: "asc" },
  });
  console.log(`\n[diag-date] SiteVisit: ${visits.length} 件`);
  for (const v of visits) {
    console.log(`   ${iso(v.date)} ${v.site?.name ?? "?"}(${v.site?.siteStatus ?? "?"}) ← ${nameOf.get(v.userId) ?? v.userId}`);
  }

  console.log("\n[diag-date] 完了（読み取りのみ）。");
} catch (e) {
  console.error("[diag-date] エラー:", e?.message ?? e);
} finally {
  await prisma.$disconnect();
}
