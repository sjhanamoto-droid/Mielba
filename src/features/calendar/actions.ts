"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dateFromKey } from "@/lib/date";
import { EVENT_CATEGORY_LABEL, type EventCategory } from "@/lib/constants";

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

      // 現場予定なら、参加者ごとに「現場入り(SiteVisit)」を作成 → その日の日報に連動
      if (siteId) {
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

    // 現場入り(SiteVisit)の同期
    if (siteId) {
      await ensureVisits(siteId, participantIds, date, user.id);
    }
    // 同一現場・同一日で外れた参加者は現場入りも解除（日報が無い場合のみ）
    const oldSiteId = existing.siteId;
    const sameContext = oldSiteId === siteId && existing.date.getTime() === date.getTime();
    if (sameContext && oldSiteId) {
      const removed = existing.participants
        .map((p) => p.userId)
        .filter((uid) => !participantIds.includes(uid));
      if (removed.length > 0) {
        // 日報がある人は「行った実績」なので現場入りを残す
        const reports = await db.dailyReport.findMany({
          where: { siteId: oldSiteId, workDate: existing.date, userId: { in: removed } },
          select: { userId: true },
        });
        const keep = new Set(reports.map((r) => r.userId));
        const removable = removed.filter((uid) => !keep.has(uid));
        if (removable.length > 0) {
          await db.siteVisit.deleteMany({
            where: { siteId: oldSiteId, date: existing.date, userId: { in: removable } },
          });
        }
      }
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
      select: { siteId: true, source: true },
    });
    if (!event) return { error: "予定が見つかりません" };
    if (event.source !== "MANUAL") return { error: "この予定は削除できません" };
    await db.calendarEvent.delete({ where: { id } });
    revalidateCalendar(event.siteId);
    return { ok: true };
  } catch (e) {
    console.error("deleteEvent failed:", e);
    return { error: "予定の削除に失敗しました。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}
