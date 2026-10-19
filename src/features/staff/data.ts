import { db } from "@/lib/db";
import { dayRangeForKey } from "@/lib/date";
import { monthlyTotal } from "@/lib/labor-cost";
import { PAY_TYPE_LABEL, type PayType } from "@/lib/constants";

// スタッフページ（最高管理者専用）のデータ取得。呼び出し側で requireSuperAdmin すること。

export type DayStatus =
  | { kind: "SITE"; label: string; siteId: string }
  | { kind: "HOLIDAY" | "OFFICE" | "NONE"; label: string };

/**
 * ある日の各スタッフの状況。配員（現場入り）＞休み＞事務所作業＞予定なし の順で決める。
 * 休み・事務所作業は本人の予定（所有者 or 参加者）。非公開の予定は業務外として見ない。
 */
export async function dayStatusByUser(dateKey: string): Promise<Map<string, DayStatus>> {
  const range = dayRangeForKey(dateKey);
  const [visits, events] = await Promise.all([
    db.siteVisit.findMany({
      where: { date: range },
      select: { userId: true, site: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.calendarEvent.findMany({
      where: { date: range, category: { in: ["HOLIDAY", "OFFICE"] }, isPrivate: false },
      select: { category: true, ownerId: true, participants: { select: { userId: true } } },
    }),
  ]);

  const map = new Map<string, DayStatus>();
  const siteCount = new Map<string, number>();
  for (const v of visits) {
    const n = (siteCount.get(v.userId) ?? 0) + 1;
    siteCount.set(v.userId, n);
    if (n === 1) map.set(v.userId, { kind: "SITE", label: v.site.name, siteId: v.site.id });
  }
  for (const [uid, n] of siteCount) {
    const s = map.get(uid)!;
    if (n > 1) map.set(uid, { ...s, label: `${s.label} ほか${n - 1}件` });
  }
  // 休みを事務所作業より優先する
  const rank = (c: string | null) => (c === "HOLIDAY" ? 0 : 1);
  const sorted = [...events].sort((a, b) => rank(a.category) - rank(b.category));
  for (const e of sorted) {
    const uids = new Set([...(e.ownerId ? [e.ownerId] : []), ...e.participants.map((p) => p.userId)]);
    for (const uid of uids) {
      if (map.has(uid)) continue;
      map.set(
        uid,
        e.category === "HOLIDAY" ? { kind: "HOLIDAY", label: "休み" } : { kind: "OFFICE", label: "事務所作業" },
      );
    }
  }
  return map;
}

/** 進行中（現調・進行中）の担当現場の数（担当者ごと） */
export async function activeAssignedSiteCounts(): Promise<Map<string, number>> {
  const rows = await db.site.groupBy({
    by: ["assigneeId"],
    where: { assigneeId: { not: null }, siteStatus: { in: ["SURVEY", "ACTIVE"] } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.assigneeId!, r._count._all]));
}

export type RateLike = {
  payType: string;
  payAmount: number | null;
  socialInsurance: number | null;
  bonusMonthly: number | null;
  otherCost: number | null;
  effectiveFrom: Date;
};

/** 給与の表示用の1行（月給は月の人件費の合計、日当・時給はその額） */
export function payLabel(r: RateLike | null): string | null {
  if (!r || r.payAmount == null) return null;
  const type = PAY_TYPE_LABEL[r.payType as PayType] ?? r.payType;
  const amount = r.payType === "MONTHLY" ? monthlyTotal(r) : r.payAmount;
  return `${type} ${amount.toLocaleString("ja-JP")}円`;
}

/** 全員の給与履歴を人ごとに */
export async function ratesByUser(): Promise<Map<string, RateLike[]>> {
  const rates = await db.staffPayRate.findMany({ orderBy: { effectiveFrom: "desc" } });
  const map = new Map<string, RateLike[]>();
  for (const r of rates) {
    const list = map.get(r.userId) ?? [];
    list.push(r);
    map.set(r.userId, list);
  }
  return map;
}

