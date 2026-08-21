// LINE Messaging API の小さなヘルパー。
// 図面・工程表PDFの「LINE→Mielba受信ボックス」取り込み（/api/line/webhook）で使う。
// 必要な環境変数: LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / LINE_JOIN_CODE（合言葉）

import { createHmac, timingSafeEqual } from "node:crypto";

/** LINE連携に必要な環境変数が揃っているか */
export function lineConfigured(): boolean {
  return Boolean(
    process.env.LINE_CHANNEL_SECRET &&
      process.env.LINE_CHANNEL_ACCESS_TOKEN &&
      process.env.LINE_JOIN_CODE,
  );
}

/** Webhook の X-Line-Signature を検証する（HMAC-SHA256 / base64） */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 返信（reply token方式のみ。push は使わない＝無料枠内） */
export async function lineReply(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });
    if (!res.ok) {
      console.error("[line] reply 失敗:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[line] reply エラー:", e);
  }
}

/** メッセージのファイル本体を取得する（サイズ・MIMEつき）。失敗時は null */
export async function fetchLineContent(
  messageId: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      console.error("[line] content 取得失敗:", res.status);
      return null;
    }
    const mime = res.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mime };
  } catch (e) {
    console.error("[line] content 取得エラー:", e);
    return null;
  }
}

/** 送信者のLINE表示名を取得する（友だち追加済み前提。失敗時は「不明」） */
export async function fetchLineProfile(lineUserId: string): Promise<string> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return "不明";
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return "不明";
    const json = (await res.json()) as { displayName?: string };
    return json.displayName || "不明";
  } catch {
    return "不明";
  }
}
