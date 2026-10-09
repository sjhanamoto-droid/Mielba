// 写真・動画（Vercel Blob）をごみ箱(trash/)から元のパスへ戻す復旧用スクリプト。
// アプリは Blob を消すとき trash/<元のパス> へコピーしてから消し、30日間置いている。
//
// 既定はドライラン（戻す対象を数えて表示するだけ）。実際に戻すには RESTORE_CONFIRM=YES。
// 対象の絞り込み（どちらか）:
//   RESTORE_PREFIX="media/2026-10-"      … 元のパスがこの文字で始まるもの
//   RESTORE_SINCE="2026-10-20T00:00:00Z" … この時刻以降にごみ箱へ入ったもの（誤削除の時刻で絞る）
//
// 実行例（本番のストアを直すときは、本番の BLOB_READ_WRITE_TOKEN を一時的に渡す）:
//   BLOB_READ_WRITE_TOKEN='<トークン>' RESTORE_SINCE='2026-10-20T05:00:00Z' node scripts/restore-blobs.mjs
//   BLOB_READ_WRITE_TOKEN='<トークン>' RESTORE_SINCE='2026-10-20T05:00:00Z' RESTORE_CONFIRM=YES node scripts/restore-blobs.mjs
// ※ 戻すだけで何も消さない（ごみ箱側のコピーも残る）。

import { copy, head, list } from "@vercel/blob";

const TRASH = "trash/";
const prefix = process.env.RESTORE_PREFIX ?? "";
const since = process.env.RESTORE_SINCE ? new Date(process.env.RESTORE_SINCE) : null;
const confirmed = process.env.RESTORE_CONFIRM === "YES";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN がありません");
  process.exit(1);
}
if (!prefix && !since) {
  console.error("RESTORE_PREFIX か RESTORE_SINCE で対象を絞ってください");
  process.exit(1);
}

const targets = [];
let cursor;
do {
  const page = await list({ prefix: TRASH + prefix, cursor, limit: 1000 });
  for (const b of page.blobs) {
    if (since && b.uploadedAt < since) continue;
    targets.push(b.pathname.slice(TRASH.length));
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

console.log(`[restore-blobs] モード: ${confirmed ? "復元" : "ドライラン（何も変更しません）"}`);
console.log(`[restore-blobs] ごみ箱の対象: ${targets.length} 件`);

let restored = 0;
let skipped = 0;
for (const p of targets) {
  // 元のパスに既にある（復元済み・上書き済み）ものは触らない
  try {
    await head(p);
    skipped++;
    continue;
  } catch {
    // 無い → 戻す対象
  }
  if (!confirmed) {
    restored++;
    continue;
  }
  await copy(TRASH + p, p, { access: "private", addRandomSuffix: false, allowOverwrite: false });
  restored++;
}
console.log(`[restore-blobs] ${confirmed ? "戻した" : "戻せる"}: ${restored} 件 / 既にあるので飛ばした: ${skipped} 件`);
