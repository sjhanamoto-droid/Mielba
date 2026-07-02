"use client";

import { useTransition, useState } from "react";
import { Check, Plus } from "lucide-react";
import { assignUser, unassignUser } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type AssignCandidate = {
  id: string;
  name: string;
  avatarColor: string;
};

export function AssignControl({
  siteId,
  candidates,
  assignedIds,
}: {
  siteId: string;
  candidates: AssignCandidate[];
  assignedIds: string[];
}) {
  const [pending, start] = useTransition();
  // 楽観的更新はせず、サーバー反映後の再レンダリングに委ねる。
  // 連打防止のため操作中のユーザーIDを保持。
  const [busyId, setBusyId] = useState<string | null>(null);
  const assigned = new Set(assignedIds);

  function toggle(userId: string, isAssigned: boolean) {
    setBusyId(userId);
    start(async () => {
      if (isAssigned) {
        await unassignUser(siteId, userId);
      } else {
        await assignUser(siteId, userId);
      }
      setBusyId(null);
    });
  }

  if (candidates.length === 0) {
    return <p className="text-sm text-ink-muted">割当可能なスタッフがいません</p>;
  }

  return (
    <div className={cn("space-y-2", pending && "opacity-70")}>
      {candidates.map((u) => {
        const isAssigned = assigned.has(u.id);
        const isBusy = busyId === u.id && pending;
        return (
          <button
            key={u.id}
            type="button"
            disabled={isBusy}
            onClick={() => toggle(u.id, isAssigned)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.99]",
              isAssigned
                ? "border-brand-200 bg-brand-50"
                : "border-line-strong bg-surface",
            )}
          >
            <Avatar name={u.name} color={u.avatarColor} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{u.name}</span>
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                isAssigned ? "bg-brand-600 text-white" : "bg-surface-sunken text-ink-muted",
              )}
            >
              {isAssigned ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
