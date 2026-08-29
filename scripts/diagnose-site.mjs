// 読み取り専用の診断スクリプト。指定した現場名の CalendarEvent と SiteVisit を突き合わせ、
// 「予定(編集可)が無く現場入りだけ残っている日（＝カレンダーから編集できない取り残し）」を洗い出す。
// 書き込みは一切しない。ビルド内（本番env）で1回実行してログで確認する用途。
//
// 実行: SITE_NAME=茨城仮設工事 node scripts/diagnose-site.mjs

import { PrismaClient } from "@prisma/client";

const NON_WORK = new Set(["HOLIDAY", "OTHER", "OFFICE"]);
const siteName = (process.env.SITE_NAME || "茨城仮設工事").trim();
const prisma = new PrismaClient();

const iso = (d) => new Date(d).toISOString().slice(0, 10);

try {
  const sites = await prisma.site.findMany({
    where: { name: { contains: siteName } },
    select: { id: true, name: true, siteStatus: true },
  });
  console.log(`[diagnose] 現場名「${siteName}」に一致: ${sites.length} 件`);
  if (sites.length === 0) {
    // 念のため全現場名を一部表示
    const all = await prisma.site.findMany({ select: { name: true }, take: 50 });
    console.log(`[diagnose] 参考: 現場名一覧(先頭50) = ${all.map((s) => s.name).join(" / ")}`);
  }

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  for (const site of sites) {
    console.log(`\n[diagnose] ===== ${site.name}（${site.siteStatus} / id=${site.id}）=====`);

    const events = await prisma.calendarEvent.findMany({
      where: { siteId: site.id },
      select: {
        id: true, date: true, source: true, category: true, title: true,
        allDay: true, startTime: true, endTime: true,
        participants: { select: { userId: true } },
      },
      orderBy: { date: "asc" },
    });
    console.log(`[diagnose] CalendarEvent: ${events.length} 件`);
    for (const e of events) {
      const who = e.participants.map((p) => nameOf.get(p.userId) ?? p.userId).join(",");
      const time = e.allDay ? "終日" : `${e.startTime ?? "--"}-${e.endTime ?? "--"}`;
      console.log(
        `   - ${iso(e.date)} [${e.source}/${e.category ?? "－"}] 「${e.title}」 ${time} 参加:${who || "なし"} (id=${e.id})`,
      );
    }

    const visits = await prisma.siteVisit.findMany({
      where: { siteId: site.id },
      select: { date: true, userId: true },
      orderBy: { date: "asc" },
    });
    console.log(`[diagnose] SiteVisit: ${visits.length} 件`);

    // 日付ごとに、編集可能な予定（作業系＝NON_WORK以外）で参加者を賄えているか判定
    const eventPeopleByDay = new Map(); // dayKey -> Set(userId)（作業系予定の参加者）
    for (const e of events) {
      if (NON_WORK.has(e.category)) continue;
      const k = iso(e.date);
      if (!eventPeopleByDay.has(k)) eventPeopleByDay.set(k, new Set());
      for (const p of e.participants) eventPeopleByDay.get(k).add(p.userId);
    }
    const visitsByDay = new Map(); // dayKey -> Set(userId)
    for (const v of visits) {
      const k = iso(v.date);
      if (!visitsByDay.has(k)) visitsByDay.set(k, new Set());
      visitsByDay.get(k).add(v.userId);
    }
    for (const [day, uidSet] of [...visitsByDay.entries()].sort()) {
      const covered = eventPeopleByDay.get(day) ?? new Set();
      const orphans = [...uidSet].filter((uid) => !covered.has(uid));
      if (orphans.length > 0) {
        console.log(
          `   ! 取り残し ${day}: 予定なしの現場入り = ${orphans.map((u) => nameOf.get(u) ?? u).join(",")}（←カレンダーから編集不可）`,
        );
      }
    }
  }
  console.log("\n[diagnose] 完了（読み取りのみ）。");
} catch (e) {
  console.error("[diagnose] エラー:", e?.message ?? e);
} finally {
  await prisma.$disconnect();
}
