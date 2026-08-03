"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";

// アプリ内通知 & Web Push 購読のサーバーアクション（フロント側）。
// 通知の生成（Cron / バックエンド）は別担当。ここは本人の閲覧・既読・購読管理のみ。
// すべて requireUser で本人に限定する。

export type NotificationActionState = { ok?: boolean; error?: string };

// クライアントへ渡す通知の形（必要な項目のみ・createdAt は Date のまま渡す）
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: Date;
};

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  read: true,
  createdAt: true,
} as const;

const LIST_LIMIT = 50;

/** 自分の通知を新しい順で取得する（最新 50 件）。 */
export async function listNotifications(): Promise<NotificationItem[]> {
  const me = await requireUser();
  return db.notification.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: NOTIFICATION_SELECT,
  });
}

/** 自分の未読件数を返す。 */
export async function unreadCount(): Promise<number> {
  const me = await requireUser();
  return db.notification.count({ where: { userId: me.id, read: false } });
}

/** 指定の通知を既読にする（本人の通知のみ）。 */
export async function markRead(id: string): Promise<NotificationActionState> {
  const me = await requireUser();
  if (!id) return { error: "通知が見つかりません" };
  try {
    // updateMany + userId 条件で他人の通知を触れないようにする
    await db.notification.updateMany({
      where: { id, userId: me.id, read: false },
      data: { read: true },
    });
  } catch {
    return { error: "既読にできませんでした。時間をおいて再度お試しください" };
  }
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 自分の未読をすべて既読にする。 */
export async function markAllRead(): Promise<NotificationActionState> {
  const me = await requireUser();
  try {
    await db.notification.updateMany({
      where: { userId: me.id, read: false },
      data: { read: true },
    });
  } catch {
    return { error: "既読にできませんでした。時間をおいて再度お試しください" };
  }
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Web Push 購読 ──
const subscribeSchema = z.object({
  endpoint: z.string().url("購読情報が不正です"),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/** Web Push の購読情報を保存する（endpoint 一意で upsert・本人に紐づけ）。 */
export async function subscribePush(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<NotificationActionState> {
  const me = await requireUser();
  const parsed = subscribeSchema.safeParse(sub);
  if (!parsed.success) return { error: "購読情報が不正です" };
  const { endpoint, keys } = parsed.data;
  try {
    await db.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
  } catch {
    return { error: "通知の登録に失敗しました。時間をおいて再度お試しください" };
  }
  return { ok: true };
}

/** Web Push の購読を解除する（自分の購読のみ削除）。 */
export async function unsubscribePush(
  endpoint: string,
): Promise<NotificationActionState> {
  const me = await requireUser();
  if (!endpoint) return { error: "購読情報が不正です" };
  try {
    await db.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } });
  } catch {
    return { error: "通知の解除に失敗しました。時間をおいて再度お試しください" };
  }
  return { ok: true };
}

/**
 * 自分の端末へテストのプッシュ通知を即時送信する（動作確認用）。
 * アプリ内通知は作らず、Web Push の経路だけを検証する。購読が無ければその旨を返す。
 */
export async function sendTestNotification(): Promise<
  { ok: true; sent: number } | { error: string }
> {
  const me = await requireUser();
  const subs = await db.pushSubscription.count({ where: { userId: me.id } });
  if (subs === 0) {
    return {
      error:
        "この端末で通知が有効になっていません。先に「プッシュ通知」をオンにして許可してください。",
    };
  }
  try {
    await sendPushToUser(me.id, {
      title: "テスト通知",
      body: "この通知が届いていれば設定は正常です 🎉",
      url: "/",
    });
  } catch {
    return { error: "テスト通知の送信に失敗しました。時間をおいて再度お試しください" };
  }
  return { ok: true, sent: subs };
}
