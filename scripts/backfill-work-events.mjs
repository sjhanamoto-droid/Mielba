// 一回限りのバックフィル：既存の「現場入り(SiteVisit)」を、カレンダーの「作業」予定に揃える。
// アプリ側の同期（配員/自己申告ON→現場×日ごとの作業予定を作成/合流）と同じ結果を、
// 過去に登録済みの現場入りに対して後追いで作る。これで既存の配員もカレンダーに
// 「作業」予定（手動・08:00〜17:00・カテゴリーWORK・詳細モーダル/編集可）として出る。
//
// 冪等：既に作業予定があればそれに合流し、既に参加者ならスキップ。何度実行しても増殖しない。
//
// 安全設計（delete-sites-once.mjs と同じ思想）:
//   - 既定は「ドライラン」。作る予定・参加者の件数を表示するだけで書き込まない。
//   - 実際に書き込むには  BACKFILL_CONFIRM=YES  を付けて再実行する。
//   - 対象日を絞るには  BACKFILL_FROM="YYYY-MM-DD"（その日以降のみ）。既定は全期間。
//   - 必ず本番DBの接続情報（本番 env）で起動すること。接続先の現場入り総数で確認できる。
//
// 実行例（まずドライラン）:
//   node scripts/backfill-work-events.mjs
// 実行例（当日以降だけ・本実行）:
//   BACKFILL_FROM=2026-08-01 BACKFILL_CONFIRM=YES node scripts/backfill-work-events.mjs

import { PrismaClient } from "@prisma/client";

const WORK_EVENT_TITLE = "作業";
const WORK_EVENT_START = "08:00";
const WORK_EVENT_END = "17:00";

const confirmed = process.env.BACKFILL_CONFIRM === "YES";
const fromRaw = (process.env.BACKFILL_FROM || "").trim();
const fromDate = /^\d{4}-\d{1,2}-\d{1,2}$/.test(fromRaw) ? new Date(`${fromRaw}T00:00:00`) : null;

const prisma = new PrismaClient();

try {
  const totalVisits = await prisma.siteVisit.count();
  console.log(`[backfill-work-events] 接続先の現場入り総数: ${totalVisits}`);
  console.log(`[backfill-work-events] 対象日: ${fromDate ? `${fromRaw} 以降` : "全期間"}`);
  console.log(`[backfill-work-events] モード: ${confirmed ? "本実行（書き込みます）" : "ドライラン（書き込みません）"}`);

  // 対象の現場入りを取得（任意で日付下限）。同じ現場×日でまとめる。
  const visits = await prisma.siteVisit.findMany({
    where: fromDate ? { date: { gte: fromDate } } : undefined,
    select: { siteId: true, userId: true, date: true, createdById: true },
    orderBy: { date: "asc" },
  });

  // key = `${siteId}|${date.getTime()}`
  const groups = new Map();
  for (const v of visits) {
    const key = `${v.siteId}|${v.date.getTime()}`;
    let g = groups.get(key);
    if (!g) {
      g = { siteId: v.siteId, date: v.date, userIds: [], createdById: v.createdById ?? null };
      groups.set(key, g);
    }
    g.userIds.push(v.userId);
    if (!g.createdById && v.createdById) g.createdById = v.createdById;
  }

  console.log(`[backfill-work-events] 対象グループ（現場×日）: ${groups.size} / 現場入り: ${visits.length}`);

  let eventsToCreate = 0;
  let participantsToAdd = 0;

  for (const g of groups.values()) {
    // 既存の作業予定（正本）を探す
    const existing = await prisma.calendarEvent.findFirst({
      where: { siteId: g.siteId, date: g.date, category: "WORK" },
      orderBy: { createdAt: "asc" },
      select: { id: true, ownerId: true },
    });

    let eventId = existing?.id ?? null;

    if (!eventId) {
      eventsToCreate++;
      if (confirmed) {
        const created = await prisma.calendarEvent.create({
          data: {
            title: WORK_EVENT_TITLE,
            date: g.date,
            siteId: g.siteId,
            category: "WORK",
            ownerId: g.userIds[0] ?? null,
            startTime: WORK_EVENT_START,
            endTime: WORK_EVENT_END,
            allDay: false,
            source: "MANUAL",
            createdById: g.createdById,
          },
          select: { id: true },
        });
        eventId = created.id;
      }
    }

    // 既存参加者を取得（本実行時のみ。ドライランでは新規作成予定=全員が追加対象）
    let existingParticipants = new Set();
    if (eventId) {
      const parts = await prisma.eventParticipant.findMany({
        where: { eventId },
        select: { userId: true },
      });
      existingParticipants = new Set(parts.map((p) => p.userId));
    }

    const uniqueUserIds = [...new Set(g.userIds)];
    const missing = uniqueUserIds.filter((uid) => !existingParticipants.has(uid));
    participantsToAdd += missing.length;

    if (confirmed && eventId && missing.length > 0) {
      await prisma.eventParticipant.createMany({
        data: missing.map((uid) => ({ eventId, userId: uid })),
      });
      // 所有者が未設定なら補完
      if (existing && !existing.ownerId) {
        await prisma.calendarEvent.update({
          where: { id: eventId },
          data: { ownerId: uniqueUserIds[0] ?? null },
        });
      }
    }
  }

  console.log(
    `[backfill-work-events] ${confirmed ? "作成" : "作成予定"}: 作業予定 ${eventsToCreate} 件 ・ 参加者追加 ${participantsToAdd} 名`,
  );
  if (!confirmed) {
    console.log(
      "[backfill-work-events] ドライラン終了。実際に反映するには BACKFILL_CONFIRM=YES を付けて再実行してください。",
    );
  } else {
    console.log("[backfill-work-events] 完了。既存の現場入りを作業予定に揃えました。");
  }
} catch (e) {
  console.error("[backfill-work-events] エラー:", e?.message ?? e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
