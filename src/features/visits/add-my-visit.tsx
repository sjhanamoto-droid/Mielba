"use client";

import { useState, useTransition } from "react";
import { Plus, X, AlertCircle, MapPin, Info } from "lucide-react";
import { addMyVisit } from "./actions";
import { cn } from "@/lib/utils";

type SiteOpt = { id: string; name: string; assigned?: boolean };

// スタッフが「今日は別の現場にも行った」と自己申告して現場入りを追加する。
// 候補は配属済みに限定せず、進行中（ACTIVE）の全現場（担当現場を上にグループ表示）。
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

  const assigned = sites.filter((s) => s.assigned);
  const others = sites.filter((s) => !s.assigned);

  // 候補ゼロでも導線は消さず、状況を案内する
  if (sites.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-subtle px-4 py-3 text-sm text-ink-muted">
        <Info className="h-4 w-4 shrink-0" />
        進行中の現場がありません。管理者に現場登録を依頼してください。
      </div>
    );
  }

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

  const renderSite = (s: SiteOpt) => (
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
  );

  return (
    <div className="card space-y-1.5 p-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-bold text-ink">行った現場を選ぶ</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken">
          <X className="h-4 w-4" />
        </button>
      </div>

      {assigned.length > 0 && (
        <>
          <p className="px-1 pt-1 text-xs font-semibold text-ink-muted">担当現場</p>
          {assigned.map(renderSite)}
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="px-1 pt-1 text-xs font-semibold text-ink-muted">その他の現場</p>
          {others.map(renderSite)}
        </>
      )}

      {err && (
        <div className="alert-danger flex items-center gap-2 px-3 py-2 text-xs font-medium">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}
        </div>
      )}
    </div>
  );
}
