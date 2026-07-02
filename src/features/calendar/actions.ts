"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { EVENT_CATEGORY_LABEL, type EventCategory } from "@/lib/constants";

// "YYYY-MM-DD" → ローカル午前0時（SiteVisit/日報の日付と揃える）
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
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

export async function createEvent(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
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

  const date = parseLocalDate(d.date);
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
      for (const uid of participantIds) {
        await db.siteVisit.upsert({
          where: { siteId_userId_date: { siteId, userId: uid, date } },
          update: {},
          create: { siteId, userId: uid, date, createdById: user.id },
        });
      }
    }
  }

  revalidateCalendar(siteId);
  return { ok: true };
}

export async function updateEvent(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
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

  const date = parseLocalDate(d.date);
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
    for (const uid of participantIds) {
      await db.siteVisit.upsert({
        where: { siteId_userId_date: { siteId, userId: uid, date } },
        update: {},
        create: { siteId, userId: uid, date, createdById: user.id },
      });
    }
  }
  // 同一現場・同一日で外れた参加者は現場入りも解除（日報が無い場合のみ）
  const oldSiteId = existing.siteId;
  const sameContext = oldSiteId === siteId && existing.date.getTime() === date.getTime();
  if (sameContext && oldSiteId) {
    const removed = existing.participants
      .map((p) => p.userId)
      .filter((uid) => !participantIds.includes(uid));
    for (const uid of removed) {
      const report = await db.dailyReport.findUnique({
        where: { siteId_userId_workDate: { siteId: oldSiteId, userId: uid, workDate: existing.date } },
      });
      if (!report) {
        await db.siteVisit.deleteMany({
          where: { siteId: oldSiteId, userId: uid, date: existing.date },
        });
      }
    }
  }

  revalidateCalendar(siteId);
  if (oldSiteId && oldSiteId !== siteId) revalidatePath(`/sites/${oldSiteId}`);
  return { ok: true };
}

export async function deleteEvent(id: string) {
  await requireUser();
  // 手動予定のみ削除可能（日報由来は削除させない）。参加者は cascade で削除。
  const event = await db.calendarEvent.findUnique({
    where: { id },
    select: { siteId: true, source: true },
  });
  if (!event || event.source !== "MANUAL") return;
  await db.calendarEvent.delete({ where: { id } });
  revalidateCalendar(event.siteId);
}
