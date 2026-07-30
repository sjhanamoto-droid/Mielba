// アプリ内通知の生成ユーティリティ。
//
// Notification を作成し（dedupeKey があれば重複生成を防止）、新規作成できた場合のみ
// 当該ユーザーへ Web Push を送る。push の失敗は握りつぶす（通知本体の作成は成功扱い）。

import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

/** createNotification の入力。userId 以外は Notification のカラムに対応する。 */
export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  href?: string;
  siteId?: string;
  reportId?: string;
  dedupeKey?: string;
};

/** 複数ユーザーへ同一内容を配る用（userId を除いた入力） */
export type NotificationPayload = Omit<NotificationInput, "userId">;

/**
 * 通知を1件作成する。
 * - dedupeKey あり: 既存があればスキップ（false）。無ければ upsert で作成（push あり）。
 * - dedupeKey なし: 常に作成（push あり）。
 * 戻り値は「新規作成したか」。Cron の created カウントに使う。
 */
export async function createNotification(
  input: NotificationInput,
): Promise<boolean> {
  const { userId, type, title, body, href, siteId, reportId, dedupeKey } = input;

  if (dedupeKey) {
    // 既存確認で「新規作成か」を判定しつつ、upsert で並行実行時の重複生成も防ぐ。
    const existing = await db.notification.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      select: { id: true },
    });
    if (existing) return false;

    await db.notification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      create: { userId, type, title, body, href, siteId, reportId, dedupeKey },
      update: {}, // 既存があれば何もしない（重複生成防止）
    });
  } else {
    await db.notification.create({
      data: { userId, type, title, body, href, siteId, reportId },
    });
  }

  // push は失敗しても通知作成自体は成功とみなす。
  try {
    await sendPushToUser(userId, { title, body, url: href });
  } catch (err) {
    console.error("[notifications] push 送信に失敗しました", err);
  }

  return true;
}

/**
 * 複数ユーザーへ同一内容の通知を配る。userId は重複除去する
 * （作成者＋管理者などで重複しても各人1件になる）。戻り値は新規作成できた件数。
 */
export async function createNotificationForUsers(
  userIds: string[],
  payload: NotificationPayload,
): Promise<number> {
  let created = 0;
  for (const userId of new Set(userIds)) {
    if (await createNotification({ ...payload, userId })) created++;
  }
  return created;
}
