"use client";

import { useState, useTransition } from "react";
import { Power, Trash2, Loader2 } from "lucide-react";
import { toggleUserActive, deleteUser } from "./actions";
import { cn } from "@/lib/utils";

export function StaffRowActions({
  id,
  active,
  canDelete,
}: {
  id: string;
  active: boolean;
  canDelete: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onToggle() {
    setErr(null);
    start(async () => {
      const r = await toggleUserActive(id);
      if (r?.error) setErr(r.error);
    });
  }

  function onDelete() {
    setErr(null);
    if (!window.confirm("このスタッフを完全に削除します。よろしいですか？")) return;
    start(async () => {
      const r = await deleteUser(id);
      if (r?.error) setErr(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
            active
              ? "text-ink-muted hover:bg-surface-sunken"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
          )}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
          {active ? "無効化" : "有効化"}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            aria-label="完全に削除"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-red-50 hover:text-status-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {err && <p className="max-w-[200px] text-right text-[11px] font-medium text-status-danger">{err}</p>}
    </div>
  );
}
