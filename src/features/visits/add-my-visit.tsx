"use client";

import { useState, useTransition } from "react";
import { Plus, X, AlertCircle, MapPin } from "lucide-react";
import { addMyVisit } from "./actions";
import { cn } from "@/lib/utils";

type SiteOpt = { id: string; name: string };

// スタッフが「今日は別の現場にも行った」と自己申告して現場入りを追加する。
export function AddMyVisit({
  sites,
  dateStr,
}: {
  sites: SiteOpt[];
  dateStr: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (sites.length === 0) return null; // 配属現場すべて現場入り済みなら不要

  function add(siteId: string) {
    setErr(null);
    start(async () => {
      const r = await addMyVisit(siteId, dateStr);
      if (r?.error) setErr(r.error);
      else setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-subtle py-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-sunken"
      >
        <Plus className="h-4 w-4" />別の現場に行った
      </button>
    );
  }

  return (
    <div className="card space-y-1.5 p-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-bold text-ink">行った現場を選ぶ</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken">
          <X className="h-4 w-4" />
        </button>
      </div>
      {sites.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => add(s.id)}
          disabled={pending}
          className={cn(
            "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-brand-50 disabled:opacity-60",
          )}
        >
          <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="truncate">{s.name}</span>
        </button>
      ))}
      {err && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}
        </div>
      )}
    </div>
  );
}
