import * as React from "react";
import { cn } from "@/lib/utils";
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_COLOR,
  STATUS_TOKEN,
  type SiteStatus,
} from "@/lib/constants";

type Tone = "neutral" | "brand" | "accent" | "info" | "active" | "warn" | "danger" | "survey" | "past";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-soft",
  brand: "bg-brand-50 text-brand-700",
  accent: "bg-accent-50 text-accent-700",
  info: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  survey: "bg-violet-50 text-violet-700",
  past: "bg-slate-100 text-slate-500",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// 現場ステータス専用のドット付きバッジ
export function SiteStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = status as SiteStatus;
  const color = STATUS_TOKEN[SITE_STATUS_COLOR[s] ?? "past"];
  const toneMap: Record<SiteStatus, Tone> = {
    SURVEY: "survey",
    ACTIVE: "active",
    PAST: "past",
  };
  return (
    <Badge tone={toneMap[s] ?? "neutral"} className={className}>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {SITE_STATUS_LABEL[s] ?? status}
    </Badge>
  );
}
