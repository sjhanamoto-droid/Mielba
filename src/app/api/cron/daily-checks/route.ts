// POST/GET /api/cron/daily-checks — 仮登録リマインド＋人工超過の日次チェック（毎日09時JST想定）。
//
// (A) 仮登録リマインド: provisional=true の現場について、作成からの経過日数(JST暦日)が
//     1/3/5/7 または 7超 のとき、作成者本人のみへ通知する。
// (B) 人工超過: actualStartDate があり targetManDays>0 の現場で、着工日以降の
//     提出済み日報件数が目標人工を超えたら、全ADMIN へ通知する。
// いずれも dedupeKey は現場・当日単位で、同日の重複通知を防ぐ。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createNotificationForUsers } from "@/lib/notifications";
import { dateFromKey, jstDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

/** Vercel Cron の Authorization ヘッダを検証する（CRON_SECRET 未設定なら不許可） */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

/** JST 暦日での経過日数（fromKey→toKey）。同日=0。 */
function daysBetween(fromKey: string, toKey: string): number {
  const ms = dateFromKey(toKey).getTime() - dateFromKey(fromKey).getTime();
  return Math.round(ms / 86_400_000);
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dayKey = jstDateKey();

  const admins = await db.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, active: true },
    select: { id: true },
  });
  const adminIds = admins.map((a) => a.id);

  let created = 0;

  // ── (A) 仮登録リマインド ──
  const provisionalSites = await db.site.findMany({
    where: { provisional: true },
    select: { id: true, name: true, createdById: true, createdAt: true },
  });
  for (const site of provisionalSites) {
    const elapsed = daysBetween(jstDateKey(site.createdAt), dayKey);
    if (![1, 3, 5, 7].includes(elapsed) && elapsed <= 7) continue;

    // 仮登録リマインドは「作成者本人のみ」に通知する（管理者含め他者には出さない）
    if (!site.createdById) continue;
    const recipients = [site.createdById];

    created += await createNotificationForUsers(recipients, {
      type: "PROVISIONAL",
      title: "仮登録の現場があります",
      body: `${site.name} が仮登録のままです`,
      href: `/sites/${site.id}`,
      siteId: site.id,
      dedupeKey: `provisional-${site.id}-${dayKey}`,
    });
  }

  // ── (B) 人工超過 ──
  if (adminIds.length > 0) {
    const targetSites = await db.site.findMany({
      where: { actualStartDate: { not: null }, targetManDays: { gt: 0 } },
      select: { id: true, name: true, actualStartDate: true, targetManDays: true },
    });
    for (const site of targetSites) {
      if (!site.actualStartDate || !site.targetManDays) continue;
      // 下書きは人工に数えない（提出済みのみ。勤怠集計と同じ基準）
      const count = await db.dailyReport.count({
        where: { siteId: site.id, workDate: { gte: site.actualStartDate }, status: "SUBMITTED" },
      });
      if (count <= site.targetManDays) continue;

      created += await createNotificationForUsers(adminIds, {
        type: "MANDAYS_OVER",
        title: "目標人工を超過",
        body: `${site.name} が目標人工(${site.targetManDays})を超えました`,
        href: `/sites/${site.id}`,
        siteId: site.id,
        dedupeKey: `mandays-${site.id}-${dayKey}`,
      });
    }
  }

  return NextResponse.json({ ok: true, created });
}

export const GET = handle;
export const POST = handle;
