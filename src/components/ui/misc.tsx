import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconBadge, type IconTone } from "@/components/ui/icon-badge";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-ink-soft">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// 円形 FAB（フローティングアクションボタン）
export function Fab({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-14 -translate-x-1/2 items-center gap-2 rounded-full bg-brand-600 pl-4 pr-5 font-bold text-white shadow-float transition-all hover:bg-brand-700 active:scale-95 md:bottom-8 md:left-auto md:right-8 md:translate-x-0"
    >
      {icon}
      <span className="text-sm">{label}</span>
    </Link>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-line", className)} />;
}

// 統計の小タイル。
// icon を渡すと参考デザイン風の「白地カード＋カラフルな丸アイコン」表現になる。
// icon 省略時は従来の淡色地・数値主体タイル（後方互換）。
const STAT_ICON_TONE: Record<string, IconTone> = {
  neutral: "slate",
  warn: "amber",
  danger: "rose",
  brand: "brand",
  active: "emerald",
};

export function StatTile({
  label,
  value,
  tone = "neutral",
  href,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "warn" | "danger" | "brand" | "active";
  href?: string;
  icon?: LucideIcon;
}) {
  // brand はトークンでダーク自動追従。Tailwind パレット色は dark: で明度を反転
  const tones: Record<string, string> = {
    neutral: "bg-surface text-ink",
    warn: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    danger: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300",
    brand: "bg-brand-50 text-brand-700",
    active:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  };

  const inner = icon ? (
    // アイコン付き：白地カード＋丸アイコン（参考デザイン準拠）
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card md:gap-3.5 md:p-4">
      <IconBadge icon={icon} tone={STAT_ICON_TONE[tone] ?? "slate"} />
      <div className="min-w-0">
        <span className="block text-2xl font-bold tnum leading-none text-ink">{value}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-ink-muted">{label}</span>
      </div>
    </div>
  ) : (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-line p-3 shadow-card",
        tones[tone],
      )}
    >
      <span className="text-2xl font-bold tnum leading-none">{value}</span>
      <span className="mt-1 text-xs font-semibold opacity-90">{label}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="tap-row block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
