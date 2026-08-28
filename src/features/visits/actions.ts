"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { dateFromKey } from "@/lib/date";

export type VisitState = { error?: string; ok?: boolean };

// "YYYY-MM-DD" → ローカル午前0時の Date。
// 日付ユーティリティは src/lib/date.ts に統一（dateFromKey が旧 parseLocalDate と同一挙動）。
function parseDateKey(s: string): Date | null {
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return null;
  const d = dateFromKey(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function revalidateVisit(siteId: string) {
  revalidatePath("/dispatch");
  revalidatePath("/reports");
  revalidatePath("/calendar");
  revalidatePath("/");
  revalidatePath(`/sites/${siteId}`);
}

// ── 配員（現場入り）⇔ カレンダーの「作業」予定 を同期 ──
// 現場×日ごとに1件の「作業」予定（手動・08:00〜17:00・カテゴリーWORK）を正本として維持し、
// 参加者＝その日の現場入り者にそろえる。カレンダーで作った作業予定があればそれに合流する
// （＝配員とカレンダーで二重の作業予定を作らない）。
const WORK_EVENT_TITLE = "作業";
const WORK_EVENT_START = "08:00";
const WORK_EVENT_END = "17:00";

async function addToWorkEvent(
  siteId: string,
  userId: string,
  date: Date,
  createdById: string,
): Promise<void> {
  const existing = await db.calendarEvent.findFirst({
    where: { siteId, date, category: "WORK" },
    orderBy: { createdAt: "asc" },
    select: { id: true, ownerId: true },
  });
  const event =
    existing ??
    (await db.calendarEvent.create({
      data: {
        title: WORK_EVENT_TITLE,
        date,
        siteId,
        category: "WORK",
        ownerId: userId,
        startTime: WORK_EVENT_START,
        endTime: WORK_EVENT_END,
        allDay: false,
        source: "MANUAL",
        createdById,
      },
      select: { id: true, ownerId: true },
    }));
  // 参加者を冪等に追加
  await db.eventParticipant.upsert({
    where: { eventId_userId: { eventId: event.id, userId } },
    update: {},
    create: { eventId: event.id, userId },
  });
  // 既存予定で所有者が未設定なら補完
  if (existing && !event.ownerId) {
    await db.calendarEvent.update({ where: { id: event.id }, data: { ownerId: userId } });
  }
}

async function removeFromWorkEvent(
  siteId: string,
  userId: string,
  date: Date,
): Promise<void> {
  const event = await db.calendarEvent.findFirst({
    where: { siteId, date, category: "WORK" },
    orderBy: { createdAt: "asc" },
    select: { id: true, note: true, ownerId: true },
  });
  if (!event) return;
  await db.eventParticipant.deleteMany({ where: { eventId: event.id, userId } });
  const remaining = await db.eventParticipant.count({ where: { eventId: event.id } });
  if (remaining === 0) {
    // 自動生成の空予定（メモ無し）は掃除する。手入力のメモがあれば残す。
    if (!event.note) await db.calendarEvent.delete({ where: { id: event.id } });
    return;
  }
  // 所有者が抜けたら、残りの参加者を所有者に繰り上げる
  if (event.ownerId === userId) {
    const next = await db.eventParticipant.findFirst({
      where: { eventId: event.id },
      select: { userId: true },
    });
    if (next) {
      await db.calendarEvent.update({ where: { id: event.id }, data: { ownerId: next.userId } });
    }
  }
}

// 配員ボード（管理者）／スタッフの自己申告 共通：現場入りを追加・取消
export async function toggleVisit(
  siteId: string,
  userId: string,
  dateStr: string,
): Promise<VisitState> {
  try {
    const me = await requireUser();
    const admin = isAdmin(me); // 最高管理者(SUPER_ADMIN)も管理者として扱う
    if (userId !== me.id && !admin) return { error: "権限がありません" };

    const date = parseDateKey(dateStr);
    if (!date) return { error: "日付が不正です" };

    // スタッフの自己申告は配属済みの現場のみ
    if (!admin) {
      const assigned = await db.siteAssignment.findUnique({
        where: { siteId_userId: { siteId, userId: me.id } },
      });
      if (!assigned) return { error: "この現場には配属されていません" };
    }

    const existing = await db.siteVisit.findUnique({
      where: { siteId_userId_date: { siteId, userId, date } },
    });

    if (existing) {
      // 取り消し：提出済み(SUBMITTED)の日報がある場合のみ不可（行った実績が確定しているため）。
      // 下書き(DRAFT)や日報なしなら取り消し可。下書きがあれば稼働も残らないよう一緒に削除する。
      const report = await db.dailyReport.findUnique({
        where: { siteId_userId_workDate: { siteId, userId, workDate: date } },
        select: { id: true, status: true },
      });
      if (report?.status === "SUBMITTED") {
        return { error: "提出済みの日報があるため取り消せません" };
      }
      if (report) {
        await db.dailyReport.delete({ where: { id: report.id } });
      }
      await db.siteVisit.delete({ where: { id: existing.id } });
      // カレンダーの「作業」予定からも外す（空になった自動予定は掃除）
      await removeFromWorkEvent(siteId, userId, date);
    } else {
      await db.siteVisit.create({ data: { siteId, userId, date, createdById: me.id } });
      // カレンダーに「作業」予定（08:00〜17:00）として反映する
      await addToWorkEvent(siteId, userId, date, me.id);
    }

    revalidateVisit(siteId);
    return { ok: true };
  } catch (e) {
    console.error("toggleVisit failed:", e);
    return { error: "現場入りの更新に失敗しました。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}

// スタッフが自分の現場入りを追加（冪等）。「別の現場に行った」導線用。
export async function addMyVisit(
  siteId: string,
  dateStr: string,
): Promise<VisitState> {
  try {
    const me = await requireUser();
    const date = parseDateKey(dateStr);
    if (!date) return { error: "日付が不正です" };

    // 「別の現場に行った」は配属に限定せず、進行中（ACTIVE）の現場なら登録できる
    // （add-my-visit.tsx が全 ACTIVE 現場を候補に出す仕様に合わせる）
    if (!isAdmin(me)) {
      const site = await db.site.findUnique({
        where: { id: siteId },
        select: { siteStatus: true },
      });
      if (!site || site.siteStatus !== "ACTIVE") {
        return { error: "進行中の現場のみ登録できます" };
      }
    }

    await db.siteVisit.upsert({
      where: { siteId_userId_date: { siteId, userId: me.id, date } },
      update: {},
      create: { siteId, userId: me.id, date, createdById: me.id },
    });
    // カレンダーに「作業」予定（08:00〜17:00）として反映する（配員と同じ扱い）
    await addToWorkEvent(siteId, me.id, date, me.id);
    revalidateVisit(siteId);
    return { ok: true };
  } catch (e) {
    console.error("addMyVisit failed:", e);
    return { error: "現場入りの登録に失敗しました。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}
