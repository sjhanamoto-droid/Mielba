// POST/GET /api/cron/daily-checks — 仮登録リマインド＋人工超過の日次チェック（毎日09時JST想定）。
//
// (A) 仮登録リマインド: provisional=true の現場について、作成からの経過日数(JST暦日)が
//     1/3/5/7 または 7超 のとき、作成者本人のみへ通知する。
// (B) 人工超過: actualStartDate があり targetManDays>0 の現場で、着工日以降の
//     提出済み日報件数が目標人工を超えたら、全ADMIN へ通知する。
// (C) 写真・動画の掃除: どの写真レコードからも参照されていない Blob をごみ箱(trash/)へ移す。
//     日報を保存せず離脱すると Blob だけが残るため。一度に大量なら中止して管理者へ通知（本番のみ）。
// (F) ごみ箱で30日を過ぎた Blob を完全に削除する（本番のみ）。
// (G) ごみ箱（削除した現場・日報・顧客のスナップショット）で30日を過ぎたものを消す。
// (D) 引き継ぎの未確認: 今日の配員のうち、その現場の対応中の引き継ぎをまだ確認していない人へ通知する。
//     アプリを開けば強制ゲートで読ませるが、開く前に気づけるよう Push でも知らせる。
// (E) 次回作業日の確認日: 日報で「次回の作業日＝未定」にした本人へ、確認日（以降も未解決なら毎日）に通知する。
//     アプリを開けば全画面で「決める／延期する」まで進めない（NextWorkGate）。
// (A)(B)(D)(E) の dedupeKey は現場（日報）・当日単位で、同日の重複通知を防ぐ。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createNotificationForUsers } from "@/lib/notifications";
import { dateFromKey, jstDateKey, todayRange } from "@/lib/date";
import { purgeBlobTrash, sweepOrphanBlobs } from "@/lib/media";
import { TRASH_KEEP_DAYS } from "@/lib/trash";
import { handoverGateSince } from "@/lib/pending-handovers";

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
    // 見送り・過去の現場は本登録を求める相手ではないので催促しない
    where: { provisional: true, siteStatus: { notIn: ["DECLINED", "PAST"] } },
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
        where: { siteId: site.id, workDate: { gte: site.actualStartDate }, status: "SUBMITTED", absent: false },
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

  // ── (D) 今日の配員への引き継ぎ未確認の通知 ──
  const todayVisits = await db.siteVisit.findMany({
    where: { date: todayRange() },
    select: { siteId: true, userId: true, site: { select: { name: true } } },
  });
  if (todayVisits.length > 0) {
    const openHandovers = await db.handover.findMany({
      where: {
        siteId: { in: Array.from(new Set(todayVisits.map((v) => v.siteId))) },
        resolvedAt: null,
        createdAt: { gte: handoverGateSince() }, // 強制ゲートと同じ対象
      },
      select: { siteId: true, createdById: true, reads: { select: { userId: true } } },
    });
    for (const v of todayVisits) {
      // 自分で書いたもの・確認済みのものは数えない（強制ゲートと同じ基準）
      const unread = openHandovers.filter(
        (h) =>
          h.siteId === v.siteId &&
          h.createdById !== v.userId &&
          !h.reads.some((r) => r.userId === v.userId),
      ).length;
      if (unread === 0) continue;

      created += await createNotificationForUsers([v.userId], {
        type: "HANDOVER_UNREAD",
        title: "引き継ぎを確認してから現場へ",
        body: `${v.site.name} に未確認の引き継ぎが${unread}件あります`,
        href: `/sites/${v.siteId}`,
        siteId: v.siteId,
        dedupeKey: `handover-unread-${v.siteId}-${dayKey}`,
      });
    }
  }

  // ── (E) 次回作業日の確認日（未定のまま確認日が来た日報の本人へ） ──
  const { lt: tomorrowStart } = todayRange();
  const dueChecks = await db.dailyReport.findMany({
    where: {
      status: "SUBMITTED",
      nextWorkChoice: "UNDECIDED",
      nextCheckResolvedAt: null,
      nextCheckDate: { lt: tomorrowStart },
    },
    select: { id: true, userId: true, siteId: true, site: { select: { name: true } } },
  });
  for (const r of dueChecks) {
    created += await createNotificationForUsers([r.userId], {
      type: "NEXT_WORK_CHECK",
      title: "次回作業日の確認日です",
      body: `${r.site.name}：次回の作業日を決めてください`,
      href: `/sites/${r.siteId}`,
      siteId: r.siteId,
      reportId: r.id,
      dedupeKey: `next-work-check-${r.id}-${dayKey}`,
    });
  }

  // ── (C) 参照されていない写真・動画 Blob の掃除（ごみ箱へ移す） ──
  // 当日アップロード中のものを巻き込まないよう、24時間より古いものだけ対象。
  // 一度に大量に消そうとしたら中止し、管理者に知らせる（設定や DB の取り違えを疑う）。
  let sweep = { deleted: 0, blocked: 0, total: 0 };
  try {
    const rows = await db.photo.findMany({
      where: { blobPath: { not: null } },
      select: { blobPath: true },
    });
    const referenced = new Set(rows.map((r) => r.blobPath as string));
    sweep = await sweepOrphanBlobs(referenced, 24 * 60 * 60 * 1000);
    if (sweep.blocked > 0) {
      created += await createNotificationForUsers(adminIds, {
        type: "BLOB_SWEEP_BLOCKED",
        title: "写真・動画の自動整理を止めました",
        body: `使われていない写真・動画が${sweep.blocked}件（全${sweep.total}件中）見つかり、多すぎるため削除を中止しました。開発担当に確認してください。`,
        href: "/",
        dedupeKey: `blob-sweep-blocked-${dayKey}`,
      });
    }
  } catch {
    // 掃除に失敗しても通知処理の結果は返す
  }

  // ── (F) ごみ箱の写真・動画で30日を過ぎたものを完全に削除 ──
  let purgedTrash = 0;
  try {
    purgedTrash = await purgeBlobTrash();
  } catch {
    // 失敗しても次回に持ち越すだけ
  }

  // ── (G) ごみ箱（削除した現場・日報・顧客）で30日を過ぎたものを消す ──
  let purgedItems = 0;
  try {
    const r = await db.trashItem.deleteMany({
      where: { deletedAt: { lt: new Date(Date.now() - TRASH_KEEP_DAYS * 86_400_000) } },
    });
    purgedItems = r.count;
  } catch {
    // 失敗しても次回に持ち越すだけ
  }

  return NextResponse.json({ ok: true, created, sweep, purgedTrash, purgedItems });
}

export const GET = handle;
export const POST = handle;
