// 人件費（労務費）の自動計算。給与・原価単価の履歴（StaffPayRate）と日報から、現場ごとの人件費を出す。
//
// 1日の原価:
//   月給 … 月の人件費（基本給＋社保会社負担＋賞与月割り＋その他）÷ その人のその月の稼働日数
//   日当 … 日当
//   時給 … 時給 × 日報の作業時間（現場ごとに、その日報の時間で計算）
// 稼働日 … 提出済み・不参加でない日報がある日＋事務所作業（公開）の予定がある日（同じ日は1日。/attendance と同じ条件）
// 1日に複数の現場がある日は、その日の原価を現場の数で等分する（0.5人工ずつ）。
// 事務所作業だけの日も稼働日数には入るが、どの現場にも配らない。
// 単価は rateOn でその日に有効な行を使う（昇給しても過去の月は変わらない）。

import { db } from "@/lib/db";
import { dateFromKey, monthRangeForKey, storedDateKey } from "@/lib/date";
import { rateOn } from "@/lib/pay-rates";
import { workMinutes } from "@/lib/utils";

export type CostRate = {
  userId: string;
  payType: string;
  payAmount: number | null;
  socialInsurance: number | null;
  bonusMonthly: number | null;
  otherCost: number | null;
  effectiveFrom: Date;
};

export type CostReport = {
  userId: string;
  siteId: string;
  workDate: Date;
  startTime: string | null;
  endTime: string | null;
};

export type CostOfficeDay = { userId: string; date: Date };

export type UserMonthCost = {
  workDays: number;
  /** 月給の月額（その月に月給の単価が無ければ null） */
  monthlyTotal: number | null;
  /** 月給の1日あたり＝月額 ÷ 月給が適用される稼働日数（稼働0日なら null） */
  perDay: number | null;
  /** その月の稼働で使った人件費の合計（事務所の日の分を含む） */
  total: number;
  /** 単価が登録されていない稼働日の数（原価に入っていない） */
  missingRateDays: number;
};

/** manDays は等分後の人工。missingRateManDays は単価未登録で原価に入っていない人工 */
export type SiteMonthCost = { cost: number; manDays: number; missingRateManDays: number };

export function monthlyTotal(r: Pick<CostRate, "payAmount" | "socialInsurance" | "bonusMonthly" | "otherCost">): number {
  return (r.payAmount ?? 0) + (r.socialInsurance ?? 0) + (r.bonusMonthly ?? 0) + (r.otherCost ?? 0);
}

/** 1か月分の日報・事務所作業・単価から、人ごと・現場ごとの人件費を出す（DBに触らない純粋関数） */
export function allocateMonth(
  reports: CostReport[],
  officeDays: CostOfficeDay[],
  rates: CostRate[],
): { bySite: Map<string, SiteMonthCost>; byUser: Map<string, UserMonthCost> } {
  // 人×日 → その日の日報
  const days = new Map<string, { userId: string; dateKey: string; reports: CostReport[] }>();
  const dayOf = (userId: string, date: Date) => {
    const dateKey = storedDateKey(date);
    const k = `${userId}|${dateKey}`;
    let d = days.get(k);
    if (!d) {
      d = { userId, dateKey, reports: [] };
      days.set(k, d);
    }
    return d;
  };
  for (const r of reports) dayOf(r.userId, r.workDate).reports.push(r);
  for (const o of officeDays) dayOf(o.userId, o.date);

  const ratesByUser = new Map<string, CostRate[]>();
  for (const r of rates) {
    const list = ratesByUser.get(r.userId) ?? [];
    list.push(r);
    ratesByUser.set(r.userId, list);
  }

  // 日ごとに有効な単価を先に決め、月給で割る日数は「月給が適用される日」だけ数える
  // （月の途中で日当・時給に切り替わった人の月給を、全稼働日で割って薄めないため）
  const byUser = new Map<string, UserMonthCost>();
  const monthlyDays = new Map<string, number>();
  const rateOfDay = new Map<string, CostRate | null>();
  for (const [k, d] of days) {
    const u = byUser.get(d.userId) ?? { workDays: 0, monthlyTotal: null, perDay: null, total: 0, missingRateDays: 0 };
    u.workDays += 1;
    byUser.set(d.userId, u);
    const rate = rateOn(ratesByUser.get(d.userId) ?? [], dateFromKey(d.dateKey));
    rateOfDay.set(k, rate);
    if (rate?.payType === "MONTHLY") monthlyDays.set(d.userId, (monthlyDays.get(d.userId) ?? 0) + 1);
  }

  const bySite = new Map<string, SiteMonthCost>();
  const addSite = (siteId: string, cost: number, manDays: number, missing = false) => {
    const s = bySite.get(siteId) ?? { cost: 0, manDays: 0, missingRateManDays: 0 };
    s.cost += cost;
    s.manDays += manDays;
    if (missing) s.missingRateManDays += manDays;
    bySite.set(siteId, s);
  };

  for (const [k, d] of days) {
    const u = byUser.get(d.userId)!;
    const rate = rateOfDay.get(k) ?? null;
    const share = d.reports.length > 0 ? 1 / d.reports.length : 0;
    if (!rate || rate.payAmount == null) {
      u.missingRateDays += 1;
      for (const r of d.reports) addSite(r.siteId, 0, share, true);
      continue;
    }
    if (rate.payType === "HOURLY") {
      for (const r of d.reports) {
        const cost = (workMinutes(r.startTime, r.endTime) / 60) * rate.payAmount;
        u.total += cost;
        addSite(r.siteId, cost, share);
      }
      continue;
    }
    let dayCost = rate.payAmount; // 日当
    if (rate.payType === "MONTHLY") {
      u.monthlyTotal = monthlyTotal(rate);
      u.perDay = u.monthlyTotal / monthlyDays.get(d.userId)!;
      dayCost = u.perDay;
    }
    u.total += dayCost;
    for (const r of d.reports) addSite(r.siteId, dayCost * share, share);
  }

  return { bySite, byUser };
}

/** 'YYYY-MM' の1か月分を DB から読んで計算する（全員分。月給の割る日数に他の現場の日も要るため） */
export async function laborCostForMonth(ym: string) {
  const range = monthRangeForKey(ym);
  const [reports, office, rates] = await Promise.all([
    db.dailyReport.findMany({
      where: { workDate: range, status: "SUBMITTED", absent: false },
      select: { userId: true, siteId: true, workDate: true, startTime: true, endTime: true },
    }),
    db.calendarEvent.findMany({
      where: { category: "OFFICE", date: range, ownerId: { not: null }, isPrivate: false },
      select: { ownerId: true, date: true },
    }),
    db.staffPayRate.findMany({ where: { effectiveFrom: { lt: range.lt } } }),
  ]);
  return allocateMonth(
    reports,
    office.map((o) => ({ userId: o.ownerId!, date: o.date })),
    rates,
  );
}

/** 現場の人件費（その現場に日報がある月だけを計算して合計） */
export async function laborCostForSite(siteId: string): Promise<SiteMonthCost> {
  const dates = await db.dailyReport.findMany({
    where: { siteId, status: "SUBMITTED", absent: false },
    select: { workDate: true },
  });
  const months = [...new Set(dates.map((d) => storedDateKey(d.workDate).slice(0, 7)))];
  const results = await Promise.all(months.map((ym) => laborCostForMonth(ym)));
  const total: SiteMonthCost = { cost: 0, manDays: 0, missingRateManDays: 0 };
  for (const { bySite } of results) {
    const s = bySite.get(siteId);
    if (!s) continue;
    total.cost += s.cost;
    total.manDays += s.manDays;
    total.missingRateManDays += s.missingRateManDays;
  }
  return total;
}
