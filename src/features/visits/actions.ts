"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
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
  revalidatePath("/");
  revalidatePath(`/sites/${siteId}`);
}

// 配員ボード（管理者）／スタッフの自己申告 共通：現場入りを追加・取消
export async function toggleVisit(
  siteId: string,
  userId: string,
  dateStr: string,
): Promise<VisitState> {
  try {
    const me = await requireUser();
    const isAdmin = me.role === "ADMIN";
    if (userId !== me.id && !isAdmin) return { error: "権限がありません" };

    const date = parseDateKey(dateStr);
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
    if (me.role !== "ADMIN") {
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
    revalidateVisit(siteId);
    return { ok: true };
  } catch (e) {
    console.error("addMyVisit failed:", e);
    return { error: "現場入りの登録に失敗しました。通信環境をご確認のうえ、もう一度お試しください。" };
  }
}
