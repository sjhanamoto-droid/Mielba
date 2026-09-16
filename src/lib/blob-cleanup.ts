// 写真レコードを消したあとに Blob 本体を消すための共通処理。サーバー専用。

import { db } from "@/lib/db";
import { deleteBlobPaths } from "@/lib/media";

/**
 * 外した写真・動画の Blob 本体を消す。ただし、ほかの写真レコード（送信の再試行で二重に
 * 登録された分など）がまだ同じパスを参照していれば残す。失敗しても日次の掃除で拾われる。
 * 写真レコードの削除がコミットされたあとに呼ぶこと（ロールバックで実体だけ失わないため）。
 */
export async function deleteUnreferencedBlobs(
  paths: (string | null | undefined)[],
): Promise<void> {
  const candidates = paths.filter((p): p is string => !!p);
  if (candidates.length === 0) return;
  const stillUsed = await db.photo.findMany({
    where: { blobPath: { in: candidates } },
    select: { blobPath: true },
  });
  const used = new Set(stillUsed.map((r) => r.blobPath));
  await deleteBlobPaths(candidates.filter((p) => !used.has(p)));
}
