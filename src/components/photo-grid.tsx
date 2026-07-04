"use client";

import { useEffect, useState } from "react";
import { X, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PHOTO_KIND_LABEL, type PhotoKind } from "@/lib/constants";
import { photoSrc } from "@/lib/photos";

/**
 * 表示用の写真メタデータ。base64（dataUrl/thumbUrl）は含めない。
 * ページ側は select: { id, caption, kind, isVideo, width, height } で取得し、
 * 実体は /api/photos/[id] から配信する（RSCペイロード削減）。
 */
export type PhotoData = {
  id: string;
  caption: string | null;
  kind: string;
  isVideo: boolean;
  width?: number | null;
  height?: number | null;
};

export function PhotoGrid({ photos }: { photos: PhotoData[] }) {
  const [active, setActive] = useState<PhotoData | null>(null);

  // ライトボックス表示中は Escape で閉じる
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => setActive(p)}
            aria-label={p.caption || (p.isVideo ? "動画を再生" : "写真を拡大")}
            className="group relative aspect-square overflow-hidden rounded-xl bg-surface-sunken active:scale-95"
          >
            {p.isVideo ? (
              // 動画本体は一覧では読み込まない（タップでライトボックス再生）
              <span className="flex h-full w-full items-center justify-center text-ink-muted">
                <Play className="h-8 w-8" />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc(p.id, true)}
                alt={p.caption ?? ""}
                loading="lazy"
                decoding="async"
                width={p.width ?? undefined}
                height={p.height ?? undefined}
                className="h-full w-full object-cover"
              />
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
          role="dialog"
          aria-modal="true"
          aria-label={active.caption || (active.isVideo ? "動画" : "写真")}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 animate-fade-in"
          onClick={() => setActive(null)}
        >
          <button
            onClick={() => setActive(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white safe-top"
            aria-label="閉じる"
          >
            <X className="h-6 w-6" />
          </button>
          {active.isVideo ? (
            <video
              src={photoSrc(active.id)}
              controls
              preload="none"
              className="max-h-[80vh] max-w-full rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc(active.id)}
              alt={active.caption ?? ""}
              decoding="async"
              className="max-h-[80vh] max-w-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
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
