// 一回限りの修正：現場に紐づく予定のうち、件名が「作業」だけのものを「現場名」に直す。
//
// 配員（現場入り）から自動生成した予定と、件名を空のまま登録した現場作業の予定は
// 件名が「作業」になっていた。カレンダーの一覧で「作業」が並ぶとどの現場か
// 分からないため、件名＝現場名にそろえる（アプリ側は登録時点で現場名を入れる）。
//
// 冪等：既に現場名になっているものは対象外。何度実行しても結果は同じ。
//
// 安全設計（backfill-work-events.mjs と同じ思想）:
//   - 既定は「ドライラン」。対象件数と変更内容を表示するだけで書き込まない。
//   - 実際に書き込むには  RENAME_CONFIRM=YES  を付けて再実行する。
//   - 現場が紐づいていない予定（個人予定）は現場名が無いため対象外。
//
// 実行例（まずドライラン）:
//   node scripts/rename-work-event-titles.mjs
// 実行例（本実行）:
//   RENAME_CONFIRM=YES node scripts/rename-work-event-titles.mjs

import { PrismaClient } from "@prisma/client";

// 件名として意味を持たない（カテゴリー名そのままの）文字列
const GENERIC_TITLES = ["作業", ""];

const confirmed = process.env.RENAME_CONFIRM === "YES";
const prisma = new PrismaClient();

try {
  const targets = await prisma.calendarEvent.findMany({
    where: { siteId: { not: null }, title: { in: GENERIC_TITLES } },
    select: { id: true, title: true, date: true, site: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  console.log(`[rename-work-event-titles] モード: ${confirmed ? "本実行（書き込みます）" : "ドライラン（書き込みません）"}`);
  console.log(`[rename-work-event-titles] 対象: ${targets.length} 件`);

  let renamed = 0;
  for (const ev of targets) {
    const name = ev.site?.name?.trim();
    if (!name) continue; // 現場名が空なら触らない
    const day = ev.date.toISOString().slice(0, 10);
    console.log(`  ${day}  「${ev.title || "(空)"}」 → 「${name}」`);
    renamed++;
    if (confirmed) {
      await prisma.calendarEvent.update({ where: { id: ev.id }, data: { title: name } });
    }
  }

  console.log(`[rename-work-event-titles] ${confirmed ? "変更" : "変更予定"}: ${renamed} 件`);
  if (!confirmed) {
    console.log("[rename-work-event-titles] ドライラン終了。反映するには RENAME_CONFIRM=YES を付けて再実行してください。");
  }
} catch (e) {
  console.error("[rename-work-event-titles] エラー:", e?.message ?? e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
