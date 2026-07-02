"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PHOTO_KIND_LABEL, type PhotoKind } from "@/lib/constants";

export type PhotoData = {
  id: string;
  dataUrl: string;
  caption: string | null;
  kind: string;
  isVideo: boolean;
};

export function PhotoGrid({ photos }: { photos: PhotoData[] }) {
  const [active, setActive] = useState<PhotoData | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => setActive(p)}
            className="group relative aspect-square overflow-hidden rounded-xl bg-surface-sunken active:scale-95"
          >
            {p.isVideo ? (
              <video src={p.dataUrl} className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.dataUrl} alt={p.caption ?? ""} className="h-full w-full object-cover" />
            )}
            {p.kind === "COMPANY_STOCK" && (
              <span className="absolute left-1 top-1 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                弊社分
              </span>
            )}
            {p.caption && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] font-medium text-white">
                {p.caption}
              </span>
            )}
          </button>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 animate-fade-in"
          onClick={() => setActive(null)}
        >
          <button
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white safe-top"
            aria-label="閉じる"
          >
            <X className="h-6 w-6" />
          </button>
          {active.isVideo ? (
            <video src={active.dataUrl} controls className="max-h-[80vh] max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.dataUrl} alt={active.caption ?? ""} className="max-h-[80vh] max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          )}
          <div className="mt-3 flex items-center gap-2 text-center text-white" onClick={(e) => e.stopPropagation()}>
            <Badge tone="neutral">{PHOTO_KIND_LABEL[active.kind as PhotoKind] ?? active.kind}</Badge>
            {active.caption && <span className="text-sm">{active.caption}</span>}
          </div>
        </div>
      )}
    </>
  );
}
