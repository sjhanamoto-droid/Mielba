// POST/GET /api/cron/weekly-missing — 今週の日報未入力者まとめ（毎週金曜10時JST想定）。
//
// 直近7日（当日を含む）で現場入り(SiteVisit)があるのに日報(SUBMITTED)が無い
// (本人, 日, 現場) を集計し、未入力者の一覧を作る。全 ADMIN へ1件通知する。
// dedupeKey は週（実行日）単位で、同週の重複通知を防ぐ。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createNotificationForUsers } from "@/lib/notifications";
import { addDaysKey, dateFromKey, jstDateKey } from "@/lib/date";

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

  const todayKey = jstDateKey();
  const startKey = addDaysKey(todayKey, -6); // 当日を含む直近7日
  const range = { gte: dateFromKey(startKey), lt: dateFromKey(addDaysKey(todayKey, 1)) };

  const [visits, reports] = await Promise.all([
    db.siteVisit.findMany({
      where: { date: range },
      select: {
        siteId: true,
        userId: true,
        date: true,
        user: { select: { name: true } },
      },
    }),
    db.dailyReport.findMany({
      where: { workDate: range, status: "SUBMITTED" },
      select: { siteId: true, userId: true, workDate: true },
    }),
  ]);

  // (現場, 本人, 日) 単位で提出済みを引く。未提出の現場入りがある人を未入力者とする。
  const submitted = new Set(
    reports.map((r) => `${r.siteId}:${r.userId}:${jstDateKey(r.workDate)}`),
  );
  const missingUsers = new Map<string, string>(); // userId -> name
  for (const v of visits) {
    const key = `${v.siteId}:${v.userId}:${jstDateKey(v.date)}`;
    if (!submitted.has(key)) missingUsers.set(v.userId, v.user.name);
  }

  if (missingUsers.size === 0) {
    return NextResponse.json({ ok: true, created: 0 });
  }

  const admins = await db.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  if (admins.length === 0) {
    return NextResponse.json({ ok: true, created: 0 });
  }

  const names = [...missingUsers.values()].join("、");
  const created = await createNotificationForUsers(
    admins.map((a) => a.id),
    {
      type: "WEEKLY_MISSING",
      title: "今週の日報未入力者",
      body: names,
      href: "/reports",
      dedupeKey: `weekly-missing-${todayKey}`,
    },
  );

  return NextResponse.json({ ok: true, created });
}

export const GET = handle;
export const POST = handle;
