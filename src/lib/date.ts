// 日付ユーティリティ — 「今日」の判定を Asia/Tokyo の暦日で統一する。
//
// 背景: Vercel のサーバーは UTC で動くため、new Date() + setHours(0,0,0,0) による
// 「今日」の判定は日本時間の朝9時まで前日扱いになるバグがあった。
// 「今日」を判定する箇所は必ず todayRange() / jstDateKey() を使うこと。
//
// なお DB の日付カラム（workDate / date 等）には「サーバーTZの深夜0時」の Date が
// 保存されている（既存 parseLocalDate と同一挙動）。dateFromKey / dayRangeForKey は
// その慣習を維持したまま、キー（'YYYY-MM-DD'）とレンジの変換を提供する。

/** Asia/Tokyo の暦日キー 'YYYY-MM-DD' を返す（en-CA ロケールは ISO 形式を出力する） */
export function jstDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 'YYYY-MM-DD' → サーバーTZの深夜0時の Date（既存 parseLocalDate と同一挙動） */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' のキーが指す1日分の範囲（Prisma の where: { gte, lt } 用） */
export function dayRangeForKey(key: string): { gte: Date; lt: Date } {
  const gte = dateFromKey(key);
  const lt = new Date(gte);
  lt.setDate(lt.getDate() + 1);
  return { gte, lt };
}

/** 日本時間の「今日」1日分の範囲 */
export function todayRange(): { gte: Date; lt: Date } {
  return dayRangeForKey(jstDateKey());
}

/** キーに日数を加算したキーを返す */
export function addDaysKey(key: string, n: number): string {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 日本時間の「明日」のキー */
export function tomorrowKey(): string {
  return addDaysKey(jstDateKey(), 1);
}
