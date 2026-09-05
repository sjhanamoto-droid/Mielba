// 一回限りの修正：現場に紐づく予定の件名を、すべて「現場名」にそろえる。
//
// 一覧では見出し＝現場名、その下の緑ラベル＝顧客名という並びにしたため、
// 「開口」「ベースライト交換」のような手入力の件名が残っていると、
// どの現場の予定か行だけでは分からなかった。
//
// 手入力されていた件名は捨てずに「内容(note)」の先頭へ移す。
// 「作業」「予定」「空」など自動補完の件名は情報が無いので移さず捨てる。
//
// 冪等：既に件名＝現場名のものは対象外。内容に同じ文字列があれば二重に足さない。
//
// 安全設計（backfill-work-events.mjs と同じ思想）:
//   - 既定は「ドライラン」。変更内容を表示するだけで書き込まない。
//   - 実際に書き込むには  RETITLE_CONFIRM=YES  を付けて再実行する。
//   - 現場が紐づいていない予定（個人予定）は対象外。
//
// 実行例（まずドライラン）:
//   node scripts/retitle-site-events.mjs
// 実行例（本実行）:
//   RETITLE_CONFIRM=YES node scripts/retitle-site-events.mjs

import { PrismaClient } from "@prisma/client";

// 自動補完の件名（内容へ移す価値が無いもの）
const GENERIC_TITLES = ["作業", "予定", ""];

const confirmed = process.env.RETITLE_CONFIRM === "YES";
const prisma = new PrismaClient();

try {
  console.log(`[retitle-site-events] モード: ${confirmed ? "本実行（書き込みます）" : "ドライラン（書き込みません）"}`);

  const events = await prisma.calendarEvent.findMany({
    where: { siteId: { not: null } },
    select: {
      id: true,
      title: true,
      note: true,
      date: true,
      site: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });
  console.log(`[retitle-site-events] 現場つきの予定: ${events.length} 件`);

  let changed = 0;
  let moved = 0;

  for (const ev of events) {
    const siteName = ev.site?.name?.trim();
    if (!siteName) continue; // 現場名が空なら触らない

    const title = (ev.title ?? "").trim();
    if (title === siteName) continue; // 既にそろっている

    const note = (ev.note ?? "").trim();
    // 手入力の件名は内容の先頭へ退避（自動補完の件名は捨てる／既に内容にあれば足さない）
    const keep =
      title && !GENERIC_TITLES.includes(title.replace(/[\s　]+/g, "")) && !note.includes(title);
    const nextNote = keep ? [title, note].filter(Boolean).join("\n") : note;

    const day = ev.date.toISOString().slice(0, 10);
    console.log(
      `  ${day}  件名「${title || "(空)"}」→「${siteName}」${keep ? "  ／ 内容へ退避" : ""}`,
    );
    changed++;
    if (keep) moved++;

    if (confirmed) {
      await prisma.calendarEvent.update({
        where: { id: ev.id },
        data: { title: siteName, note: nextNote || null },
      });
    }
  }

  console.log(
    `[retitle-site-events] ${confirmed ? "変更" : "変更予定"}: ${changed} 件（うち内容へ退避 ${moved} 件）`,
  );
  if (!confirmed) {
    console.log("[retitle-site-events] ドライラン終了。反映するには RETITLE_CONFIRM=YES を付けて再実行してください。");
  }
} catch (e) {
  console.error("[retitle-site-events] エラー:", e?.message ?? e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
