// POST /api/line/webhook — LINE Messaging API のWebhook。
//
// 図面・工程表PDFの取り込み口。LINEで届いたPDFをMielbaのLINE公式アカウント
// （ボット）のトークに転送すると、受信ボックス（Photo kind="INBOX"）に保存され、
// アプリの /inbox から現場（図面/工程表）へ振り分けられる。
//
// - 送信者は合言葉（LINE_JOIN_CODE）を1回送って承認された人のみ（LineSender.approved）
// - PDFのみ・8MB上限。返信は reply token 方式のみ（push 無し＝LINE無料枠内）
// - 署名検証（X-Line-Signature）が通らないリクエストは 401

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createNotificationForUsers } from "@/lib/notifications";
import {
  lineConfigured,
  verifyLineSignature,
  lineReply,
  fetchLineContent,
  fetchLineProfile,
} from "@/lib/line";

export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8MB（base64化で約1.33倍になる点も考慮した上限）
const INBOX_URL = "https://mielba.vercel.app/inbox";

const GUIDE_JOIN = [
  "こちらはMielbaの受信ボックスです。",
  "利用を開始するには、社内で共有されている合言葉をこのトークに送ってください。",
].join("\n");

const GUIDE_USAGE = [
  "PDFファイル（図面・工程表）をこのトークに転送すると、Mielbaの受信ボックスに取り込まれます。",
  "取り込み後はアプリの「受信ボックス」から現場に振り分けてください。",
].join("\n");

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: {
    id: string;
    type: string;
    text?: string;
    fileName?: string;
    fileSize?: number;
  };
};

async function handleEvent(ev: LineEvent): Promise<void> {
  const lineUserId = ev.source?.userId;
  const replyToken = ev.replyToken ?? "";

  // 友だち追加時は合言葉の案内だけ返す
  if (ev.type === "follow") {
    await lineReply(replyToken, GUIDE_JOIN);
    return;
  }
  if (ev.type !== "message" || !ev.message || !lineUserId) return;

  const sender = await db.lineSender.findUnique({
    where: { lineUserId },
  });
  const approved = sender?.approved === true;
  const msg = ev.message;

  // ── テキスト: 合言葉なら承認、それ以外は案内 ──
  if (msg.type === "text") {
    const text = (msg.text ?? "").trim();
    const joinCode = (process.env.LINE_JOIN_CODE ?? "").trim();
    if (joinCode && text === joinCode) {
      const displayName = await fetchLineProfile(lineUserId);
      await db.lineSender.upsert({
        where: { lineUserId },
        create: { lineUserId, displayName, approved: true },
        update: { displayName, approved: true },
      });
      await lineReply(replyToken, "登録しました。\n" + GUIDE_USAGE);
      return;
    }
    await lineReply(replyToken, approved ? GUIDE_USAGE : GUIDE_JOIN);
    return;
  }

  // ── ファイル: PDFのみ受信ボックスへ ──
  if (msg.type === "file") {
    if (!approved) {
      await lineReply(replyToken, GUIDE_JOIN);
      return;
    }
    const fileName = (msg.fileName || "").trim() || "ファイル.pdf";
    if (!/\.pdf$/i.test(fileName)) {
      await lineReply(
        replyToken,
        "PDFファイルのみ対応しています。図面・工程表はPDFで転送してください。",
      );
      return;
    }
    if (msg.fileSize && msg.fileSize > MAX_PDF_BYTES) {
      await lineReply(replyToken, "ファイルが大きすぎます（8MBまで）。");
      return;
    }

    const content = await fetchLineContent(msg.id);
    if (!content) {
      await lineReply(
        replyToken,
        "ファイルの取得に失敗しました。時間をおいてもう一度お送りください。",
      );
      return;
    }
    if (content.buffer.byteLength > MAX_PDF_BYTES) {
      await lineReply(replyToken, "ファイルが大きすぎます（8MBまで）。");
      return;
    }
    // LINEのfileメッセージはPDFでも application/octet-stream で返ることがあるため、
    // MIMEは pdf / octet-stream のみ許容し、拡張子.pdfと合わせて判定する。
    if (
      !content.mime.includes("application/pdf") &&
      !content.mime.includes("octet-stream")
    ) {
      await lineReply(
        replyToken,
        "PDFファイルのみ対応しています。図面・工程表はPDFで転送してください。",
      );
      return;
    }

    const senderName = sender?.displayName ?? "不明";
    await db.photo.create({
      data: {
        kind: "INBOX",
        dataUrl: `data:application/pdf;base64,${content.buffer.toString("base64")}`,
        fileName,
        lineSenderName: senderName,
      },
    });

    // 管理者へアプリ内通知（振り分け漏れ防止）
    const admins = await db.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, active: true },
      select: { id: true },
    });
    await createNotificationForUsers(
      admins.map((a) => a.id),
      {
        type: "LINE_INBOX",
        title: "LINEからPDFが届きました",
        body: `${senderName}: ${fileName}`,
        href: "/inbox",
      },
    );

    await lineReply(
      replyToken,
      `「${fileName}」を受け取りました。\nMielbaの受信ボックスから現場に振り分けてください。\n${INBOX_URL}`,
    );
    return;
  }

  // 画像・動画など（PDF以外のメッセージ種別）
  await lineReply(
    replyToken,
    approved
      ? "PDFファイルのみ対応しています。図面・工程表はPDFで転送してください。"
      : GUIDE_JOIN,
  );
}

export async function POST(req: NextRequest) {
  if (!lineConfigured()) {
    return NextResponse.json({ error: "LINE連携が未設定です" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifyLineSignature(raw, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: { events?: LineEvent[] };
  try {
    body = JSON.parse(raw) as { events?: LineEvent[] };
  } catch {
    return NextResponse.json({ ok: true });
  }

  // 1件の失敗で他イベントやLINE側の再送を巻き込まないよう、常に200を返す
  for (const ev of body.events ?? []) {
    try {
      await handleEvent(ev);
    } catch (e) {
      console.error("[line-webhook] イベント処理エラー:", e);
    }
  }
  return NextResponse.json({ ok: true });
}
