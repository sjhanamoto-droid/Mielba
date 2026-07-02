"use client";

import { useTransition, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { addRelatedSite, removeRelation } from "./actions";
import { CardLink } from "@/components/ui/card";
import { Select, Input } from "@/components/ui/form";
import { SiteStatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RelatedRow = {
  relationId: string;
  note: string | null;
  other: { id: string; name: string; address: string | null; siteStatus: string };
};

export type RelationCandidate = {
  id: string;
  name: string;
  address: string | null;
};

export function RelationControl({
  siteId,
  related,
  candidates,
}: {
  siteId: string;
  related: RelatedRow[];
  candidates: RelationCandidate[];
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");

  function add() {
    if (!selected) return;
    const otherId = selected;
    const noteValue = note;
    start(async () => {
      await addRelatedSite(siteId, otherId, noteValue || undefined);
      setSelected("");
      setNote("");
    });
  }

  function remove(relationId: string) {
    start(async () => {
      await removeRelation(relationId, siteId);
    });
  }

  return (
    <div className={cn("space-y-3", pending && "opacity-70")}>
      {related.length > 0 && (
        <div className="space-y-2">
          {related.map((r) => (
            <div key={r.relationId} className="flex items-center gap-2">
              <CardLink
                href={`/sites/${r.other.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 p-3.5"
              >
                <SiteStatusBadge status={r.other.siteStatus} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.other.name}</p>
                  {r.other.address && (
                    <p className="truncate text-xs text-ink-muted">{r.other.address}</p>
                  )}
                  {r.note && <p className="truncate text-xs text-ink-faint">{r.note}</p>}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </CardLink>
              <button
                type="button"
                onClick={() => remove(r.relationId)}
                disabled={pending}
                aria-label="関連を解除"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-ink-muted active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-line-strong bg-surface/50 p-3">
          <p className="text-xs font-semibold text-ink-muted">関連現場を追加</p>
          <Select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="関連現場を選択"
          >
            <option value="">現場を選択…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.address ? `（${c.address}）` : ""}
              </option>
            ))}
          </Select>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="メモ（任意）"
          />
          <button
            type="button"
            onClick={add}
            disabled={pending || !selected}
            className={buttonClass({ size: "md", className: "w-full" })}
          >
            <Plus className="h-4 w-4" />
            関連現場を追加
          </button>
        </div>
      ) : (
        related.length === 0 && (
          <p className="text-sm text-ink-muted">追加できる関連現場の候補はありません</p>
        )
      )}
    </div>
  );
}
