"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dateFromKey } from "@/lib/date";
import {
  EVENT_CATEGORY_LABEL,
  isNonWorkEventCategory,
  type EventCategory,
} from "@/lib/constants";

// "YYYY-MM-DD" → ローカル午前0時（SiteVisit/日報の日付と揃える）。
// 日付ユーティリティは src/lib/date.ts に統一（dateFromKey が旧 parseLocalDate と同一挙動）。
function parseDateKey(s: string): Date | null {
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return null;
  const d = dateFromKey(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const eventSchema = z.object({
  title: z.string().optional(),
  date: z.string().min(1, "日付を選択してください"),
  siteId: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean(),
  note: z.string().optional(),
});

function revalidateCalendar(siteId?: string | null) {
  revalidatePath("/calendar");
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/dispatch");
  if (siteId) revalidatePath(`/sites/${siteId}`);
}

// 現場予定の参加者に「現場入り(SiteVisit)」を冪等に作成する。
// 逐次 upsert のforループだと参加者数ぶん往復するため、既存確認→差分 createMany に最適化
// （SQLite は createMany の skipDuplicates 非対応のため、差分方式で互換を保つ）。
async function ensureVisits(
  siteId: string,
  userIds: string[],
  date: Date,
  createdById: string,
): Promise<void> {
  if (userIds.length === 0) return;
  const existing = await db.siteVisit.findMany({
    where: { siteId, date, userId: { in: userIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((v) => v.userId));
  const missing = userIds.filter((uid) => !existingSet.has(uid));
  if (missing.length > 0) {
    await db.siteVisit.createMany({
      data: missing.map((uid) => ({ siteId, userId: uid, date, createdById })),
    });
  }
}

// 指定の (siteId, date) から、対象ユーザーの現場入り(SiteVisit)を掃除する。
// 予定の日付・現場を変えた（＝予定が移動した）ときや、予定を削除したときに、
// もう不要になった旧コンテキストの現場入りを消してカレンダーと配員を一致させる。
// ただし次の人は残す（実績・他予定との整合を壊さないため）:
//   (a) その日その現場に日報がある人（行った実績）
//   (b) 同じ (siteId, date) に残る別の作業系予定に、まだ参加している人
// excludeEventId は「残る別の予定」判定から自分自身を除外するための予定ID。
async function pruneVisits(
  siteId: string,
  date: Date,
  userIds: string[],
  excludeEventId: string,
): Promise<void> {
  const targets = [...new Set(userIds)];
  if (targets.length === 0) return;

  const reports = await db.dailyReport.findMany({
    where: { siteId, workDate: date, userId: { in: targets } },
    select: { userId: true },
  });
  const keep = new Set(reports.map((r) => r.userId));

  // 同一 (siteId, date) に残る他の予定のうち、現場作業を生む予定（休み/その他/事務所作業 以外）の
  // 参加者は現場入りを残す。null カテゴリーも作業扱いのため JS 側で判定する（SQLのNOT IN×NULL回避）。
  const others = await db.calendarEvent.findMany({
    where: { siteId, date, id: { not: excludeEventId } },
    select: { category: true, participants: { select: { userId: true } } },
  });
  for (const e of others) {
    if (isNonWorkEventCategory(e.category)) continue;
    for (const p of e.participants) keep.add(p.userId);
  }

  const removable = targets.filter((uid) => !keep.has(uid));
  if (removable.length > 0) {
    await db.siteVisit.deleteMany({
      where: { siteId, date, userId: { in: removable } },
    });
  }
}

export async function createEvent(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const parsed = eventSchema.safeParse({
      title: formData.get("title") || undefined,
      date: formData.get("date"),
      siteId: formData.get("siteId") || undefined,
      category: formData.get("category") || undefined,
      location: formData.get("location") || undefined,
      startTime: formData.get("startTime") || undefined,
      endTime: formData.get("endTime") || undefined,
      allDay: formData.get("allDay") === "on" || formData.get("allDay") === "true",
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) return { error: parsed.error.errors[0]?.message };
    const d = parsed.data;

    const date = parseDateKey(d.date);
    if (!date) return { error: "日付が不正です" };

    const siteId = d.siteId || null;
    const participantIds = [
      ...new Set(formData.getAll("participants").map(String).filter(Boolean)),
    ];

    // 件名が未入力なら カテゴリー名で補完
    let title = (d.title ?? "").trim();
    if (!title) {
      title = d.category
        ? EVENT_CATEGORY_LABEL[d.category as EventCategory] ?? "予定"
        : "予定";
    }

    // 個人予定（現場なし）は本人が所有者。現場予定は参加者が主役。
    const ownerId = siteId ? participantIds[0] ?? null : user.id;

    const event = await db.calendarEvent.create({
      data: {
        title,
        date,
        siteId,
        category: d.category || null,
        location: d.location || null,
        ownerId,
        startTime: d.allDay ? null : d.startTime || null,
        endTime: d.allDay ? null : d.endTime || null,
        allDay: d.allDay,
        note: d.note || null,
        source: "MANUAL",
        createdById: user.id,
      },
    });

    if (participantIds.length > 0) {
      await db.eventParticipant.createMany({
        data: participantIds.map((uid) => ({ eventId: event.id, userId: uid })),
      });

      // 現場予定なら、参加者ごとに「現場入り(SiteVisit)」を作成 → その日の日報に連動。
      // ただし「休み」「その他」は現場作業ではないため、現場を選んでも現場入りは作らない。
      if (siteId && !isNonWorkEventCategory(d.category)) {
        await ensureVisits(siteId, participantIds, date, user.id);
      }
    }

    revalidateCalendar(siteId);
    return { ok: true };
  } catch (e) {
    console.error("createEvent failed:", e);
    return { error: "予定の作成に失敗しました。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}

export async function updateEvent(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const id = (formData.get("id") ?? "").toString();
    if (!id) return { error: "対象が不正です" };

    const existing = await db.calendarEvent.findUnique({
      where: { id },
      include: { participants: { select: { userId: true } } },
    });
    if (!existing) return { error: "予定が見つかりません" };
    if (existing.source !== "MANUAL") return { error: "この予定は編集できません" };

    const parsed = eventSchema.safeParse({
      title: formData.get("title") || undefined,
      date: formData.get("date"),
      siteId: formData.get("siteId") || undefined,
      category: formData.get("category") || undefined,
      location: formData.get("location") || undefined,
      startTime: formData.get("startTime") || undefined,
      endTime: formData.get("endTime") || undefined,
      allDay: formData.get("allDay") === "on" || formData.get("allDay") === "true",
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) return { error: parsed.error.errors[0]?.message };
    const d = parsed.data;

    const date = parseDateKey(d.date);
    if (!date) return { error: "日付が不正です" };

    const siteId = d.siteId || null;
    const participantIds = [
      ...new Set(formData.getAll("participants").map(String).filter(Boolean)),
    ];

    let title = (d.title ?? "").trim();
    if (!title) {
      title = d.category
        ? EVENT_CATEGORY_LABEL[d.category as EventCategory] ?? "予定"
        : "予定";
    }

    const ownerId = siteId ? participantIds[0] ?? null : existing.ownerId;

    await db.calendarEvent.update({
      where: { id },
      data: {
        title,
        date,
        siteId,
        category: d.category || null,
        location: d.location || null,
        ownerId,
        startTime: d.allDay ? null : d.startTime || null,
        endTime: d.allDay ? null : d.endTime || null,
        allDay: d.allDay,
        note: d.note || null,
      },
    });

    // 参加者を差し替え
    await db.eventParticipant.deleteMany({ where: { eventId: id } });
    if (participantIds.length > 0) {
      await db.eventParticipant.createMany({
        data: participantIds.map((uid) => ({ eventId: id, userId: uid })),
      });
    }

    // 現場入り(SiteVisit)を新しいコンテキスト(現場×日)に同期。「休み」「その他」は作らない。
    const nonWork = isNonWorkEventCategory(d.category);
    if (siteId && !nonWork) {
      await ensureVisits(siteId, participantIds, date, user.id);
    }

    // 旧コンテキスト(oldSiteId, oldDate)から不要になった現場入りを掃除する。
    // これでカレンダーと配員が一致する（日付や現場を変えたら配員の日付も移動する）。
    //  - 予定が移動（現場 or 日付が変わった）: 旧コンテキストの旧参加者を掃除
    //  - 休み/その他へ変更（同一コンテキスト）: 現場作業ではないので（新旧）参加者を掃除
    //  - 参加者を外しただけ（同一コンテキスト・作業のまま）: 外した人を掃除
    const oldSiteId = existing.siteId;
    const oldDate = existing.date;
    if (oldSiteId) {
      const prevParticipantIds = existing.participants.map((p) => p.userId);
      const contextChanged = oldSiteId !== siteId || oldDate.getTime() !== date.getTime();
      const removeCandidates = contextChanged
        ? prevParticipantIds
        : nonWork
          ? [...new Set([...prevParticipantIds, ...participantIds])]
          : prevParticipantIds.filter((uid) => !participantIds.includes(uid));
      await pruneVisits(oldSiteId, oldDate, removeCandidates, id);
    }

    revalidateCalendar(siteId);
    if (oldSiteId && oldSiteId !== siteId) revalidatePath(`/sites/${oldSiteId}`);
    return { ok: true };
  } catch (e) {
    console.error("updateEvent failed:", e);
    return { error: "予定の更新に失敗しました。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}

export async function deleteEvent(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireUser();
    // 手動予定のみ削除可能（日報由来は削除させない）。参加者は cascade で削除。
    const event = await db.calendarEvent.findUnique({
      where: { id },
      select: {
        siteId: true,
        source: true,
        date: true,
        category: true,
        participants: { select: { userId: true } },
      },
    });
    if (!event) return { error: "予定が見つかりません" };
    if (event.source !== "MANUAL") return { error: "この予定は削除できません" };
    const participantIds = event.participants.map((p) => p.userId);
    await db.calendarEvent.delete({ where: { id } });
    // 現場作業予定なら、紐づく現場入り(配員)も掃除してカレンダーと一致させる
    //（提出済み日報や、同日同現場に残る別の作業予定の参加者は残す）。
    if (event.siteId && !isNonWorkEventCategory(event.category)) {
      await pruneVisits(event.siteId, event.date, participantIds, id);
    }
    revalidateCalendar(event.siteId);
    return { ok: true };
  } catch (e) {
    console.error("deleteEvent failed:", e);
    return { error: "予定の削除に失敗しました。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}
