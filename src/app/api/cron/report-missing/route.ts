// POST/GET /api/cron/report-missing — 日報の当日未入力リマインド（毎日17時JST想定）。
//
// 当日(JST)に現場入り(SiteVisit)があるのに、その (現場, 本人, 当日) の日報が
// SUBMITTED で存在しないユーザーへ「日報が未入力です」を通知する。
// dedupeKey で当日・現場・本人あたり1回に制限する。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { dayRangeForKey, jstDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

/** Vercel Cron の Authorization ヘッダを検証する（CRON_SECRET 未設定なら不許可） */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dayKey = jstDateKey();
  const range = dayRangeForKey(dayKey);

  // 当日の現場入りと、当日の提出済み日報を取得して突き合わせる。
  const [visits, reports] = await Promise.all([
    db.siteVisit.findMany({
      where: { date: range },
      select: { siteId: true, userId: true },
    }),
    db.dailyReport.findMany({
      where: { workDate: range, status: "SUBMITTED" },
      select: { siteId: true, userId: true },
    }),
  ]);

  const submitted = new Set(reports.map((r) => `${r.siteId}:${r.userId}`));

  let created = 0;
  for (const visit of visits) {
    if (submitted.has(`${visit.siteId}:${visit.userId}`)) continue;
    const done = await createNotification({
      userId: visit.userId,
      type: "REPORT_MISSING",
      title: "日報が未入力です",
      body: "本日分の日報を入力してください",
      href: "/reports",
      siteId: visit.siteId,
      dedupeKey: `report-missing-${dayKey}-${visit.siteId}-${visit.userId}`,
    });
    if (done) created++;
  }

  return NextResponse.json({ ok: true, created });
}

export const GET = handle;
export const POST = handle;
