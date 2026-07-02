import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
        <p className="mt-1 max-w-xs text-xs text-ink-muted">{description}</p>
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

// 統計の小タイル
export function StatTile({
  label,
  value,
  tone = "neutral",
  href,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "warn" | "danger" | "brand" | "active";
  href?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface text-ink",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-600",
    brand: "bg-brand-50 text-brand-700",
    active: "bg-emerald-50 text-emerald-700",
  };
  const inner = (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-line p-3 shadow-card",
        tones[tone],
      )}
    >
      <span className="text-2xl font-bold tnum leading-none">{value}</span>
      <span className="mt-1 text-xs font-medium opacity-80">{label}</span>
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
