"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isAdmin, isSuperAdmin } from "@/lib/session";
import { dateFromKey, storedDateKey } from "@/lib/date";
import { findNearbySiteWorkEvents, recordNotDuplicate, type NearbyEvent } from "@/lib/nearby-events";
import {
  EVENT_CATEGORY_LABEL,
  isNonWorkEventCategory,
  isUserEditableEventSource,
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
  isPrivate: z.boolean().default(false),
});

/**
 * 件名と内容を決める。
 *
 * 現場を選んだ予定は、一覧でどの現場か一目で分かるよう「件名＝現場名」に統一する。
 * 件名に作業内容（例：開口）が手入力されていた場合は捨てずに内容(note)の先頭へ移す。
 * 現場なしの個人予定は、従来どおり入力された件名（未入力ならカテゴリー名）を使う。
 */
async function resolveTitleAndNote(
  siteId: string | null,
  rawTitle: string,
  rawNote: string,
  category?: string | null,
): Promise<{ title: string; note: string }> {
  const typed = rawTitle.trim();
  const note = rawNote.trim();

  if (siteId) {
    const site = await db.site.findUnique({ where: { id: siteId }, select: { name: true } });
    const siteName = site?.name?.trim();
    if (siteName) {
      // 現場名と違う件名が入っていたら、作業内容として内容欄の先頭に残す
      const keep = typed && typed !== siteName && !note.includes(typed);
      return { title: siteName, note: keep ? [typed, note].filter(Boolean).join("\n") : note };
    }
  }

  if (typed) return { title: typed, note };
  const label = category ? EVENT_CATEGORY_LABEL[category as EventCategory] ?? "予定" : "予定";
  return { title: label, note };
}

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
      isPrivate: formData.get("isPrivate") === "on" || formData.get("isPrivate") === "true",
    });
    if (!parsed.success) return { error: parsed.error.errors[0]?.message };
    const d = parsed.data;

    const date = parseDateKey(d.date);
    if (!date) return { error: "日付が不正です" };

    const siteId = d.siteId || null;
    let participantIds = [
      ...new Set(formData.getAll("participants").map(String).filter(Boolean)),
    ];

    // 現場つきは件名＝現場名。個人予定は入力された件名（未入力ならカテゴリー名）。
    const { title, note } = await resolveTitleAndNote(
      siteId,
      d.title ?? "",
      d.note ?? "",
      d.category,
    );

    // 個人予定（現場なし）は本人が所有者。現場予定は参加者が主役。
    const ownerId = siteId ? participantIds[0] ?? null : user.id;

    // 非公開は「最高管理者が自分の個人予定に付ける」ときだけ。
    // 現場の予定は配員・日報に連動して他の人が見る前提なので非公開にできない。
    const isPrivate = isSuperAdmin(user) && !siteId && d.isPrivate;
    // 本人にしか見えない予定に参加者を残さない（見えない人を巻き込まないため）
    if (isPrivate) participantIds = [];

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
        note: note || null,
        isPrivate,
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
    // 「どちらも正しい（別の工事）」と選んだ近い日の予定は、以後 重複かもの印を出さない
    await recordNotDuplicate(event.id, formData.getAll("notDuplicateOf").map(String));

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
    // 非公開の予定は所有者以外には見えない。編集も同じく本人だけに許す。
    if (existing.isPrivate && existing.ownerId !== user.id) {
      return { error: "予定が見つかりません" };
    }
    // 手動の予定と、日報の次回作業日から入った予定（PROCESS）は誰でも編集できる
    if (!isUserEditableEventSource(existing.source)) return { error: "この予定は編集できません" };

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
      isPrivate: formData.get("isPrivate") === "on" || formData.get("isPrivate") === "true",
    });
    if (!parsed.success) return { error: parsed.error.errors[0]?.message };
    const d = parsed.data;

    const date = parseDateKey(d.date);
    if (!date) return { error: "日付が不正です" };

    const siteId = d.siteId || null;
    let participantIds = [
      ...new Set(formData.getAll("participants").map(String).filter(Boolean)),
    ];

    const { title, note } = await resolveTitleAndNote(
      siteId,
      d.title ?? "",
      d.note ?? "",
      d.category,
    );

    const ownerId = siteId ? participantIds[0] ?? null : existing.ownerId;

    // 非公開を切り替えられるのは、最高管理者が自分の個人予定を編集するときだけ。
    // それ以外（他人の予定・現場の予定）は今の状態を保つ＝勝手に非公開にならない/解除されない。
    const canSetPrivate = isSuperAdmin(user) && !siteId && existing.ownerId === user.id;
    const isPrivate = siteId ? false : canSetPrivate ? d.isPrivate : existing.isPrivate;
    // 本人にしか見えない予定に参加者を残さない（見えない人を巻き込まないため）
    if (isPrivate) participantIds = [];

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
        note: note || null,
        isPrivate,
        // 日報に結び付いた予定を別の現場へ移したら、もう元の日報の次回作業日ではないので切り離す
        ...(existing.reportId && existing.siteId !== siteId
          ? { source: existing.source === "PROCESS" ? "MANUAL" : existing.source, reportId: null }
          : {}),
      },
    });

    // 日報に結び付いた予定の日付を動かしたら、元の日報の「次回作業日」も合わせる
    if (
      existing.reportId &&
      existing.siteId === siteId &&
      existing.date.getTime() !== date.getTime()
    ) {
      await db.dailyReport.updateMany({
        where: { id: existing.reportId, nextWorkChoice: "DATE" },
        data: { nextWorkDate: date },
      });
      revalidatePath(`/reports/${existing.reportId}`);
    }

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

    await recordNotDuplicate(id, formData.getAll("notDuplicateOf").map(String));

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
    const user = await requireUser();
    // 手動予定・日報の次回作業日から入った予定は誰でも削除可能。それ以外（配達など）は管理者のみ。参加者は cascade で削除。
    const event = await db.calendarEvent.findUnique({
      where: { id },
      select: {
        siteId: true,
        source: true,
        date: true,
        category: true,
        isPrivate: true,
        ownerId: true,
        participants: { select: { userId: true } },
      },
    });
    if (!event) return { error: "予定が見つかりません" };
    // 非公開の予定は所有者以外には見えない。削除も同じく本人だけに許す。
    if (event.isPrivate && event.ownerId !== user.id) {
      return { error: "予定が見つかりません" };
    }
    if (!isUserEditableEventSource(event.source) && !isAdmin(user)) return { error: "この予定は削除できません" };
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

// 管理者がカレンダーの「現場入り」チップ（予定に紐づかない配員）を削除する。
// 表示中の人（userIds）の現場入りだけを消す。日報・予定には触れない。
export async function deleteVisitGroup(
  siteId: string,
  dateIso: string,
  userIds: string[],
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!isAdmin(user)) return { error: "削除は管理者のみ可能です" };
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime()) || userIds.length === 0) {
      return { error: "対象が見つかりません" };
    }
    await db.siteVisit.deleteMany({ where: { siteId, date, userId: { in: userIds } } });
    revalidateCalendar(siteId);
    return { ok: true };
  } catch (e) {
    console.error("deleteVisitGroup failed:", e);
    return { error: "現場入りの削除に失敗しました。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}

// ───────────────────────── 同じ現場の予定の重複確認 ─────────────────────────
// 手動の予定と日報の次回作業日が二重に入らないよう、保存の前に前後数日の同じ現場の作業予定を探す。
export async function checkNearbyEvents(input: {
  siteId: string;
  date: string;
  excludeEventId?: string | null;
  excludeReportId?: string | null;
  minDateKey?: string | null;
}): Promise<{ events: NearbyEvent[] }> {
  try {
    await requireUser();
    if (!input.siteId || !parseDateKey(input.date)) return { events: [] };
    const events = await findNearbySiteWorkEvents(input.siteId, input.date, {
      excludeEventId: input.excludeEventId,
      excludeReportId: input.excludeReportId,
      minDateKey: input.minDateKey && parseDateKey(input.minDateKey) ? input.minDateKey : null,
    });
    return { events };
  } catch (e) {
    // 確認できなくても保存は止めない（今までどおり保存できる）
    console.error("checkNearbyEvents failed:", e);
    return { events: [] };
  }
}

type DuplicateTarget = {
  id: string;
  siteId: string | null;
  date: Date;
  title: string;
  category: string | null;
  location: string | null;
  note: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  isPrivate: boolean;
  ownerId: string | null;
  source: string;
  reportId: string | null;
  participants: { userId: string }[];
};

async function loadEditableEvent(id: string, userId: string): Promise<DuplicateTarget | null> {
  const e = await db.calendarEvent.findUnique({
    where: { id },
    include: { participants: { select: { userId: true } } },
  });
  if (!e || (e.isPrivate && e.ownerId !== userId) || !isUserEditableEventSource(e.source)) return null;
  return e;
}

// 片方を消す前に、日報の結び付きと次回作業日を残す方へ移す。
// 残す方は人がまとめた予定になるので手動の予定（MANUAL）にする（日報を消しても消えない）。
async function handOverReportLink(from: DuplicateTarget, to: DuplicateTarget, date: Date): Promise<void> {
  const linkTo = !to.reportId && from.reportId ? { reportId: from.reportId } : {};
  await db.calendarEvent.update({ where: { id: to.id }, data: { source: "MANUAL", ...linkTo } });
  if (!from.reportId) return;
  await db.calendarEvent.update({ where: { id: from.id }, data: { reportId: null } });
  await db.dailyReport.updateMany({
    where: { id: from.reportId, nextWorkChoice: "DATE" },
    data: { nextWorkDate: date },
  });
  revalidatePath(`/reports/${from.reportId}`);
}

/**
 * 入力中の予定を、近い日にある同じ現場の予定（targetId）にまとめる＝新しく作らない。
 * useNewDate: true なら今入れた日付が正しい（既存の予定をその日付へ動かす）、false なら既存の日付のまま。
 * 入力した参加者は既存の予定に足し、内容（メモ）も消さずに足す。時間は既存の予定のまま。
 * 編集中の予定（formData の id）があれば、まとめたあと消す（日報の結び付きは既存の予定へ移す）。
 */
export async function mergeIntoEvent(
  formData: FormData,
  targetId: string,
  useNewDate: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const target = await loadEditableEvent(targetId, user.id);
    if (!target || !target.siteId) return { error: "まとめる予定が見つかりません" };
    const newDateKey = (formData.get("date") ?? "").toString();
    const newDate = parseDateKey(newDateKey);
    if (!newDate) return { error: "日付が不正です" };
    const finalDate = useNewDate ? newDate : target.date;

    const sourceId = (formData.get("id") ?? "").toString();
    const source = sourceId && sourceId !== targetId ? await loadEditableEvent(sourceId, user.id) : null;
    if (sourceId && sourceId !== targetId && !source) return { error: "予定が見つかりません" };

    const participants = [
      ...new Set([
        ...target.participants.map((p) => p.userId),
        ...formData.getAll("participants").map(String).filter(Boolean),
      ]),
    ];
    // 入力した件名（作業内容）も、現場予定の登録と同じく内容の先頭に残す
    const typedTitle = (formData.get("title") ?? "").toString().trim();
    const typedNote = (formData.get("note") ?? "").toString().trim();
    const newNote =
      typedTitle && typedTitle !== target.title && !typedNote.includes(typedTitle)
        ? [typedTitle, typedNote].filter(Boolean).join("\n")
        : typedNote;
    const oldNote = (target.note ?? "").trim();
    const note = newNote && !oldNote.includes(newNote) ? [oldNote, newNote].filter(Boolean).join("\n") : oldNote;

    const fd = new FormData();
    fd.set("id", target.id);
    fd.set("siteId", target.siteId);
    fd.set("date", storedDateKey(finalDate));
    if (target.category) fd.set("category", target.category);
    fd.set("title", target.title);
    fd.set("location", target.location ?? (formData.get("location") ?? "").toString());
    fd.set("note", note);
    fd.set("allDay", target.allDay ? "true" : "false");
    if (target.startTime) fd.set("startTime", target.startTime);
    if (target.endTime) fd.set("endTime", target.endTime);
    for (const uid of participants) fd.append("participants", uid);

    const res = await updateEvent(fd);
    if (res.error) return res;
    // 既存の予定を直せてから、日報の結び付きを移して編集中の予定を消す
    const merged = await loadEditableEvent(target.id, user.id);
    if (merged) {
      if (source) await handOverReportLink(source, merged, finalDate);
      else await db.calendarEvent.update({ where: { id: target.id }, data: { source: "MANUAL" } });
    }
    if (source) {
      const del = await deleteEvent(source.id);
      if (del.error) return del;
    }
    revalidateCalendar(target.siteId);
    return { ok: true };
  } catch (e) {
    console.error("mergeIntoEvent failed:", e);
    return { error: "予定をまとめられませんでした。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}

/**
 * 既にカレンダーに二重に入っている同じ現場の予定を1つにする。keepId を残し、dropId を消す。
 * 消す方の参加者は残す方へ足し、日報の次回作業日の結び付きも残す方へ移す（日付は残す方に合わせる）。
 */
export async function resolveDuplicate(
  keepId: string,
  dropId: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (keepId === dropId) return { error: "対象が不正です" };
    const [keep, drop] = await Promise.all([
      loadEditableEvent(keepId, user.id),
      loadEditableEvent(dropId, user.id),
    ]);
    if (!keep || !drop) return { error: "予定が見つかりません" };
    if (!keep.siteId || keep.siteId !== drop.siteId) return { error: "同じ現場の予定ではありません" };

    const have = new Set(keep.participants.map((p) => p.userId));
    const add = drop.participants.map((p) => p.userId).filter((u) => !have.has(u));
    if (add.length > 0) {
      await db.eventParticipant.createMany({
        data: add.map((userId) => ({ eventId: keep.id, userId })),
      });
      if (!isNonWorkEventCategory(keep.category)) {
        await ensureVisits(keep.siteId, add, keep.date, user.id);
      }
    }
    await handOverReportLink(drop, keep, keep.date);
    const del = await deleteEvent(drop.id);
    if (del.error) return del;
    revalidateCalendar(keep.siteId);
    return { ok: true };
  } catch (e) {
    console.error("resolveDuplicate failed:", e);
    return { error: "予定をまとめられませんでした。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}

/** 予定の詳細の「どちらも正しい」：近い日の同じ現場の予定を別の工事として残し、重複かもの印を消す */
export async function markNotDuplicate(
  eventId: string,
  otherId: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const [a, b] = await Promise.all([
      loadEditableEvent(eventId, user.id),
      loadEditableEvent(otherId, user.id),
    ]);
    if (!a || !b || a.siteId !== b.siteId) return { error: "予定が見つかりません" };
    await recordNotDuplicate(a.id, [b.id]);
    revalidateCalendar(a.siteId);
    return { ok: true };
  } catch (e) {
    console.error("markNotDuplicate failed:", e);
    return { error: "記録できませんでした。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}
