"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type VisitState = { error?: string; ok?: boolean };

// "YYYY-MM-DD" → ローカル午前0時の Date
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

function revalidateVisit(siteId: string) {
  revalidatePath("/dispatch");
  revalidatePath("/reports");
  revalidatePath("/");
  revalidatePath(`/sites/${siteId}`);
}

// 配員ボード（管理者）／スタッフの自己申告 共通：現場入りを追加・取消
export async function toggleVisit(
  siteId: string,
  userId: string,
  dateStr: string,
): Promise<VisitState> {
  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  if (userId !== me.id && !isAdmin) return { error: "権限がありません" };

  const date = parseLocalDate(dateStr);
  if (!date) return { error: "日付が不正です" };

  // スタッフの自己申告は配属済みの現場のみ
  if (!isAdmin) {
    const assigned = await db.siteAssignment.findUnique({
      where: { siteId_userId: { siteId, userId: me.id } },
    });
    if (!assigned) return { error: "この現場には配属されていません" };
  }

  const existing = await db.siteVisit.findUnique({
    where: { siteId_userId_date: { siteId, userId, date } },
  });

  if (existing) {
    // 取り消し：日報が既にある場合は不可（行った実績があるため）
    const report = await db.dailyReport.findUnique({
      where: { siteId_userId_workDate: { siteId, userId, workDate: date } },
    });
    if (report) return { error: "日報があるため取り消せません" };
    await db.siteVisit.delete({ where: { id: existing.id } });
  } else {
    await db.siteVisit.create({ data: { siteId, userId, date, createdById: me.id } });
  }

  revalidateVisit(siteId);
  return { ok: true };
}

// スタッフが自分の現場入りを追加（冪等）。「別の現場に行った」導線用。
export async function addMyVisit(
  siteId: string,
  dateStr: string,
): Promise<VisitState> {
  const me = await requireUser();
  const date = parseLocalDate(dateStr);
  if (!date) return { error: "日付が不正です" };

  if (me.role !== "ADMIN") {
    const assigned = await db.siteAssignment.findUnique({
      where: { siteId_userId: { siteId, userId: me.id } },
    });
    if (!assigned) return { error: "この現場には配属されていません" };
  }

  await db.siteVisit.upsert({
    where: { siteId_userId_date: { siteId, userId: me.id, date } },
    update: {},
    create: { siteId, userId: me.id, date, createdById: me.id },
  });
  revalidateVisit(siteId);
  return { ok: true };
}
