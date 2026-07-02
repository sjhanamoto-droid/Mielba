import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format,
  formatDistanceToNowStrict,
  isToday as dfIsToday,
  isTomorrow,
  isYesterday,
  differenceInCalendarDays,
  startOfDay,
} from "date-fns";
import { ja } from "date-fns/locale";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── 日付フォーマット ──
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "yyyy/MM/dd", { locale: ja });
}

export function fmtDateWithDay(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "yyyy/MM/dd(E)", { locale: ja });
}

export function fmtMonthDay(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "M/d(E)", { locale: ja });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "M/d HH:mm", { locale: ja });
}

export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: ja });
}

export function isToday(d: Date | string): boolean {
  return dfIsToday(typeof d === "string" ? new Date(d) : d);
}

// 期限の表現（今日／明日／昨日／n日後／n日前）
export function dueLabel(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (dfIsToday(date)) return "今日";
  if (isTomorrow(date)) return "明日";
  if (isYesterday(date)) return "昨日";
  const diff = differenceInCalendarDays(startOfDay(date), startOfDay(new Date()));
  if (diff > 0) return `${diff}日後`;
  return `${Math.abs(diff)}日超過`;
}

export function isOverdue(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  const date = typeof d === "string" ? new Date(d) : d;
  return differenceInCalendarDays(startOfDay(date), startOfDay(new Date())) < 0;
}

// ── 金額（将来フェーズ表示用） ──
export function fmtYen(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "¥" + n.toLocaleString("ja-JP");
}

// 作業時間（"08:00"〜"17:00"）から実働時間を計算
export function workHours(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return "—";
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

// 名前からアバター用イニシャル（日本語は先頭1文字）
export function initials(name: string): string {
  if (!name) return "?";
  return name.trim().charAt(0);
}

export function toDateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
}
