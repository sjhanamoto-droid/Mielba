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

// 件名として意味を持たない（未入力時の自動補完そのままの）文字列。
// 「作業」= カテゴリーWORKの既定、「予定」= カテゴリー未選択の既定。
// 「打合せ」「その他」等は手入力の可能性があるため対象にしない。
const GENERIC_TITLES = ["作業", "予定", ""];

const confirmed = process.env.RENAME_CONFIRM === "YES";
const prisma = new PrismaClient();

try {
  console.log(`[rename-work-event-titles] モード: ${confirmed ? "本実行（書き込みます）" : "ドライラン（書き込みません）"}`);

  // 現場つきの予定を全件見て、件名を突き合わせる（前後の空白・全角空白も許容するため
  // SQL の完全一致ではなく、取得後に trim して判定する）。
  const events = await prisma.calendarEvent.findMany({
    where: { siteId: { not: null } },
    select: { id: true, title: true, date: true, category: true, site: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  const totalEvents = await prisma.calendarEvent.count();
  console.log(
    `[rename-work-event-titles] 予定 総数: ${totalEvents} / 現場つき: ${events.length}`,
  );

  // 何が入っているかを把握するため、現場つき予定の件名を集計して出す
  const counts = new Map();
  for (const ev of events) {
    const t = (ev.title ?? "").trim() || "(空)";
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  console.log("[rename-work-event-titles] 現場つき予定の件名（多い順・最大30）:");
  for (const [t, n] of top) console.log(`    ${n} 件  「${t}」`);

  let renamed = 0;
  for (const ev of events) {
    const title = (ev.title ?? "").replace(/[\s\u3000]+/g, "");
    if (!GENERIC_TITLES.includes(title)) continue;
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
