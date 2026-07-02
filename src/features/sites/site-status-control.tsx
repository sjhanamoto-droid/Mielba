"use client";

import { useTransition } from "react";
import { changeSiteStatus } from "./actions";
import { cn } from "@/lib/utils";
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_COLOR,
  STATUS_TOKEN,
  type SiteStatus,
} from "@/lib/constants";

const STATUSES: SiteStatus[] = ["SURVEY", "ACTIVE", "PAST"];

export function SiteStatusControl({
  siteId,
  status,
}: {
  siteId: string;
  status: string;
}) {
  const [pending, start] = useTransition();
  const current = status as SiteStatus;

  return (
    <div className={cn("space-y-2", pending && "opacity-60")}>
      <p className="text-xs font-semibold text-ink-muted">現場ステータスを変更</p>
      <div className="grid grid-cols-3 gap-2">
        {STATUSES.map((s) => {
          const active = s === current;
          const color = STATUS_TOKEN[SITE_STATUS_COLOR[s] ?? "past"];
          return (
            <button
              key={s}
              type="button"
              disabled={pending || active}
              onClick={() => start(() => changeSiteStatus(siteId, s))}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-bold transition-all active:scale-[0.97]",
                active
                  ? "border-transparent text-white"
                  : "border-line-strong bg-surface text-ink-soft",
              )}
              style={active ? { backgroundColor: color } : undefined}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? "#fff" : color }}
              />
              {SITE_STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
