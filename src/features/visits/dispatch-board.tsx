"use client";

import { useState, useTransition } from "react";
import { Check, AlertCircle, HardHat } from "lucide-react";
import { toggleVisit } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Staff = { id: string; name: string; avatarColor: string };
type SiteRow = {
  id: string;
  name: string;
  customerName: string | null;
  staff: Staff[];
  visitedIds: string[];
};

export function DispatchBoard({
  sites,
  dateStr,
}: {
  sites: SiteRow[];
  dateStr: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [visited, setVisited] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {};
    for (const s of sites) m[s.id] = new Set(s.visitedIds);
    return m;
  });

  function toggle(siteId: string, userId: string) {
    setErr(null);
    const was = visited[siteId]?.has(userId) ?? false;
    // 楽観的更新
    setVisited((prev) => {
      const n = { ...prev };
      const set = new Set(n[siteId]);
      if (was) set.delete(userId);
      else set.add(userId);
      n[siteId] = set;
      return n;
    });
    start(async () => {
      const r = await toggleVisit(siteId, userId, dateStr);
      if (r?.error) {
        setErr(r.error);
        // 失敗時は戻す
        setVisited((prev) => {
          const n = { ...prev };
          const set = new Set(n[siteId]);
          if (was) set.add(userId);
          else set.delete(userId);
          n[siteId] = set;
          return n;
        });
      }
    });
  }

  const totalGoing = sites.reduce((acc, s) => acc + (visited[s.id]?.size ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3">
        <span className="text-sm font-semibold text-brand-700">この日の現場入り 合計</span>
        <span className="text-lg font-bold tnum text-brand-700">{totalGoing}名</span>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />{err}
        </div>
      )}

      <div className="space-y-3">
        {sites.map((s) => {
          const goingCount = visited[s.id]?.size ?? 0;
          return (
            <div key={s.id} className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-ink">{s.name}</p>
                  {s.customerName && (
                    <p className="truncate text-xs text-ink-muted">{s.customerName}</p>
                  )}
                </div>
                <span className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                  goingCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-surface-sunken text-ink-muted",
                )}>
                  {goingCount}名
                </span>
              </div>

              {s.staff.length === 0 ? (
                <p className="text-sm text-ink-muted">配属スタッフがいません</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {s.staff.map((u) => {
                    const on = visited[s.id]?.has(u.id) ?? false;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggle(s.id, u.id)}
                        disabled={pending}
                        aria-pressed={on}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60",
                          on
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-line-strong bg-surface text-ink-soft",
                        )}
                      >
                        <span className="relative">
                          <Avatar name={u.name} color={u.avatarColor} size="sm" />
                          {on && (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                              <Check className="h-2.5 w-2.5 text-brand-600" strokeWidth={4} />
                            </span>
                          )}
                        </span>
                        {u.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sites.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong py-12 text-center text-ink-muted">
          <HardHat className="h-7 w-7" />
          <p className="text-sm">進行中の現場がありません</p>
        </div>
      )}

      <p className="px-1 text-xs text-ink-faint">
        スタッフをタップで「この日の現場入り」をON/OFF。ONにした人だけ、その日の日報対象になります。
      </p>
    </div>
  );
}
