import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * IconBadge — 参考デザイン（Atouch）で多用されている「淡い円地＋鮮やかなアイコン」の
 * カラフルな丸アイコンバッジ。視認性が高く親しみやすい表現をアプリ全体で共有するための素体。
 * トーンは淡色地＋濃色アイコンでライト/ダーク両対応。
 */

export type IconTone =
  | "brand"
  | "emerald"
  | "amber"
  | "teal"
  | "sky"
  | "violet"
  | "rose"
  | "slate";

type IconSize = "sm" | "md" | "lg";

const TONE: Record<IconTone, string> = {
  brand: "bg-brand-50 text-brand-600",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300",
  slate: "bg-surface-sunken text-ink-muted",
};

const BOX: Record<IconSize, string> = {
  sm: "h-9 w-9 rounded-xl",
  md: "h-11 w-11 rounded-2xl",
  lg: "h-12 w-12 rounded-2xl",
};

const GLYPH: Record<IconSize, string> = {
  sm: "h-[18px] w-[18px]",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function IconBadge({
  icon: Icon,
  tone = "brand",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: IconTone;
  size?: IconSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        BOX[size],
        TONE[tone],
        className,
      )}
    >
      <Icon className={GLYPH[size]} strokeWidth={2.1} aria-hidden />
    </span>
  );
}
