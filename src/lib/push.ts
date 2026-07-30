// Web Push 送信ユーティリティ。
//
// あるユーザーの全 PushSubscription へ Web Push を送る。送信失敗が 404/410
// （購読失効）なら該当 PushSubscription を DB から削除する。VAPID 未設定時は
// no-op（ログのみ）で、開発環境などキー未設定でもアプリを壊さない。

import webpush, { WebPushError } from "web-push";
import { db } from "@/lib/db";

/** プッシュ通知のペイロード（Service Worker 側で title/body/url を解釈する） */
export type PushPayload = { title: string; body?: string; url?: string };

/**
 * env の VAPID キーを web-push にセットする。設定が揃っていなければ false を返す。
 * setVapidDetails は冪等なので毎回呼んで問題ない。
 */
function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * userId の全購読先へプッシュ通知を送信する。
 * 送信失敗のうち 404/410（購読失効）は当該 PushSubscription を削除する。
 * VAPID 未設定時は何もしない（ログのみ）。
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!configureVapid()) {
    console.warn("[push] VAPID 未設定のため送信をスキップしました");
    return;
  }

  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err) {
        const statusCode = err instanceof WebPushError ? err.statusCode : undefined;
        // 404/410 は購読が失効しているため購読情報を破棄する。
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
          return;
        }
        console.error("[push] 送信に失敗しました", statusCode ?? "", err);
      }
    }),
  );
}
