import { Briefcase, HardHat, Moon, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayStatus } from "./data";

// 今日の状況（現場入り／休み／事務所作業／予定なし）
const STYLE: Record<DayStatus["kind"], { cls: string; Icon: typeof HardHat }> = {
  SITE: { cls: "bg-brand-50 text-brand-700", Icon: HardHat },
  HOLIDAY: { cls: "bg-surface-sunken text-ink-soft", Icon: Moon },
  OFFICE: { cls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300", Icon: Briefcase },
  NONE: { cls: "text-ink-faint", Icon: Minus },
};

export function DayStatusBadge({ status, prefix = "今日" }: { status: DayStatus; prefix?: string }) {
  const { cls, Icon } = STYLE[status.kind];
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {prefix}：{status.label}
      </span>
    </span>
  );
}
