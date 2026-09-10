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

/**
 * 動画のタイル。サムネイル（先頭フレーム）があれば出し、無ければ再生アイコンにする。
 * サムネイルが無い動画に ?v=thumb を投げると API が 404 を返すので、本体を落とさずに済む。
 */
function VideoThumb({ photo }: { photo: PhotoData }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex h-full w-full items-center justify-center text-ink-muted">
        <Play className="h-8 w-8" />
      </span>
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoSrc(photo.id, true)}
        alt={photo.caption ?? ""}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Play className="h-7 w-7 text-white drop-shadow" />
      </span>
    </>
  );
}

export function PhotoGrid({ photos }: { photos: PhotoData[] }) {
  const [active, setActive] = useState<PhotoData | null>(null);
  // 端末が形式に対応していないと再生できない（iPhoneのHEVC動画をAndroidで開いた場合など）
  const [playbackFailed, setPlaybackFailed] = useState(false);

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
            onClick={() => {
              setPlaybackFailed(false);
              setActive(p);
            }}
            aria-label={p.caption || (p.isVideo ? "動画を再生" : "写真を拡大")}
            className="group relative aspect-square overflow-hidden rounded-xl bg-surface-sunken active:scale-95"
          >
            {p.isVideo ? (
              // 動画本体は一覧では読み込まない（タップでライトボックス再生）
              <VideoThumb photo={p} />
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
            playbackFailed ? (
              <div
                className="max-w-sm rounded-xl bg-white p-5 text-center text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="font-bold text-ink">この端末では再生できませんでした</p>
                <p className="mt-1.5 text-[12px] text-ink-muted">
                  iPhoneの「高効率」設定で撮った動画は、Androidやパソコンで再生できないことがあります。
                </p>
                <a
                  href={photoSrc(active.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-lg bg-brand-500 px-4 py-2 font-bold text-white"
                >
                  ダウンロードして開く
                </a>
              </div>
            ) : (
              <video
                src={photoSrc(active.id)}
                controls
                playsInline
                preload="metadata"
                onError={() => setPlaybackFailed(true)}
                className="max-h-[80vh] max-w-full rounded-xl"
                onClick={(e) => e.stopPropagation()}
              />
            )
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
