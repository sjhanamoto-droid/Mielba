import { FileWarning, FileX, CalendarClock, TrendingUp, Bell, type LucideIcon } from "lucide-react";
import type { IconTone } from "@/components/ui/icon-badge";

// 通知タイプごとのアイコン・色・ラベル。通知センターと起動ゲートで共有する。
// 未知タイプは既定（ベル/ブランド色）にフォールバックする。
type NotificationMeta = { icon: LucideIcon; tone: IconTone; label: string };

const META: Record<string, NotificationMeta> = {
  PROVISIONAL: { icon: FileWarning, tone: "amber", label: "仮登録" },
  REPORT_MISSING: { icon: FileX, tone: "rose", label: "日報未提出" },
  WEEKLY_MISSING: { icon: CalendarClock, tone: "violet", label: "週報未提出" },
  MANDAYS_OVER: { icon: TrendingUp, tone: "sky", label: "工数超過" },
};

const DEFAULT_META: NotificationMeta = { icon: Bell, tone: "brand", label: "お知らせ" };

export function notificationMeta(type: string): NotificationMeta {
  return META[type] ?? DEFAULT_META;
}
