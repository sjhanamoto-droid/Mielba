"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Play, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PHOTO_KIND_LABEL, type PhotoKind } from "@/lib/constants";
import { photoSrc } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { ZoomableImage, type ZoomableImageHandle } from "@/components/zoomable-image";

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
  /** 動画の長さ（秒）。編集用アップローダーの「0:08」表示に使う */
  duration?: number | null;
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

export function PhotoGrid({
  photos,
  canDelete,
  onDelete,
}: {
  photos: PhotoData[];
  /** 拡大表示に「削除」を出す写真か（onDelete と併せて渡す） */
  canDelete?: (photo: PhotoData) => boolean;
  /** 削除の実行。エラーメッセージを返すと拡大表示の中に出す */
  onDelete?: (photo: PhotoData) => Promise<{ error?: string } | void>;
}) {
  // 拡大表示中の写真は配列の位置で持つ（前後へ移動するため）
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // 端末が形式に対応していないと再生できない（iPhoneのHEVC動画をAndroidで開いた場合など）
  const [playbackFailed, setPlaybackFailed] = useState(false);
  // 削除は拡大表示の中で2段階確認（誤タップ防止）
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 拡大表示は横スクロール（スナップ）で1枚ずつ並べる。スマホは指でスライド、ボタンでも移動
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isOpen = activeIndex != null;
  // 表示中の画像を拡大しているか（拡大中は横スライドを止めて、画像の移動に指を使う）
  const [zoomed, setZoomed] = useState(false);
  const zoomRef = useRef<ZoomableImageHandle | null>(null);

  const total = photos.length;
  const active = activeIndex != null ? (photos[activeIndex] ?? null) : null;
  const hasPrev = activeIndex != null && activeIndex > 0;
  const hasNext = activeIndex != null && activeIndex < total - 1;

  function resetPerPhoto() {
    setPlaybackFailed(false);
    setConfirmDelete(false);
    setDeleteError(null);
    setZoomed(false);
  }

  function open(index: number) {
    resetPerPhoto();
    setDeleting(false);
    setActiveIndex(index);
  }

  function close() {
    // 削除の通信中は閉じない（失敗したときのメッセージを見せるため）
    if (deleting) return;
    setActiveIndex(null);
  }

  /** 前後へ移動する（端では止まる。削除中は動かさない）。表示位置はスクロールから決まる */
  function go(delta: 1 | -1) {
    const el = trackRef.current;
    if (deleting || activeIndex == null || !el) return;
    const next = activeIndex + delta;
    if (next < 0 || next >= total) return;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  /** スクロール位置から今見えている写真を決める */
  function onTrackScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const idx = Math.min(total - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    if (idx !== activeIndex) {
      resetPerPhoto();
      setActiveIndex(idx);
    }
  }

  // 開いたとき：タップした写真の位置へ即座に合わせる（アニメーションなし）
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!isOpen || !el || activeIndex == null) return;
    el.scrollLeft = activeIndex * el.clientWidth;
    // 開いた瞬間だけ合わせる（以降はスクロールが activeIndex を動かす）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 画面の回転・幅の変化でずれないよう、今の写真に合わせ直す
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => {
      const el = trackRef.current;
      if (el && activeIndex != null) el.scrollLeft = activeIndex * el.clientWidth;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOpen, activeIndex]);

  async function runDelete(p: PhotoData) {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await onDelete(p);
      if (res && res.error) setDeleteError(res.error);
      else setActiveIndex(null);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  // 表示中の写真が（別の場所での削除などで）無くなったら閉じる
  useEffect(() => {
    if (activeIndex != null && !photos[activeIndex]) setActiveIndex(null);
  }, [photos, activeIndex]);

  // ライトボックス表示中：Escape で閉じる、← → で前後へ、背面のページはスクロールさせない
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // close/go は毎回作り直されるので、使う値（activeIndex など）を依存に入れる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeIndex, deleting, total]);

  // 隣の写真を先に読んでおく（次へ進んだときに待たせない。動画は重いので対象外）
  useEffect(() => {
    if (activeIndex == null) return;
    for (const i of [activeIndex - 1, activeIndex + 1]) {
      const p = photos[i];
      if (!p || p.isVideo) continue;
      const img = new Image();
      img.src = photoSrc(p.id);
    }
  }, [activeIndex, photos]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => open(i)}
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

      {active && activeIndex != null && (
        /*
         * data-noswipe: 現場詳細のタブ（連絡・メモ／現場情報／日報）は横スワイプで切り替わるので、
         * ライトボックス上のスワイプはタブ側に拾わせない（写真を横にスライドする操作にする）。
         * 背面のページは body の overflow で止め、上下の帯は touch-none で動かさない。
         */
        <div
          role="dialog"
          aria-modal="true"
          aria-label={active.caption || (active.isVideo ? "動画" : "写真")}
          data-noswipe
          className="fixed inset-0 z-50 flex flex-col overscroll-contain bg-black/90 animate-fade-in"
          onClick={close}
        >
          {/* 上部：枚数と閉じる */}
          <div
            className="safe-top absolute inset-x-0 top-0 z-20 flex touch-none items-center justify-between px-4 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white tnum">
              {activeIndex + 1} / {total}
            </span>
            {!active.isVideo && (
              <span className="ml-auto mr-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => zoomRef.current?.zoomOut()}
                  disabled={!zoomed}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white",
                    !zoomed && "opacity-30",
                  )}
                  aria-label="縮小"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => zoomRef.current?.zoomIn()}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
                  aria-label="拡大"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={close}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
              aria-label="閉じる"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* 前後へ（端では薄くして無効に）。スマホは横にスライドしても移動できる */}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                disabled={!hasPrev}
                aria-label="前の写真"
                className={cn(
                  "absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white",
                  !hasPrev && "opacity-30",
                )}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                disabled={!hasNext}
                aria-label="次の写真"
                className={cn(
                  "absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white",
                  !hasNext && "opacity-30",
                )}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* 写真を横一列に並べてスナップ。削除の通信中は動かさない */}
          <div
            ref={trackRef}
            onScroll={onTrackScroll}
            className={cn(
              "no-scrollbar flex min-h-0 w-full flex-1 snap-x snap-mandatory overscroll-x-contain touch-pan-x",
              deleting || zoomed ? "overflow-hidden" : "overflow-x-auto",
            )}
          >
            {photos.map((p, i) => {
              const isActive = i === activeIndex;
              // 近くの写真だけ読み込む（遠い写真や動画本体は表示するまで読まない）
              const near = Math.abs(i - activeIndex) <= 1;
              return (
                <div
                  key={p.id}
                  className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center overflow-hidden px-4 pb-2 pt-16"
                >
                  {!near ? null : p.isVideo ? (
                    !isActive ? (
                      // 隣の動画はサムネイルだけ（スライドしてきたら本体を読む）
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc(p.id, true)}
                        alt=""
                        className="max-h-full max-w-full rounded-xl object-contain opacity-60"
                      />
                    ) : playbackFailed ? (
                      <div
                        className="max-w-sm rounded-xl bg-white p-5 text-center text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="font-bold text-ink">この端末では再生できませんでした</p>
                        <p className="mt-1.5 text-[12px] text-ink-muted">
                          iPhoneの「高効率」設定で撮った動画は、Androidやパソコンで再生できないことがあります。
                        </p>
                        <a
                          href={photoSrc(p.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex rounded-lg bg-brand-500 px-4 py-2 font-bold text-white"
                        >
                          ダウンロードして開く
                        </a>
                      </div>
                    ) : (
                      <video
                        key={p.id}
                        src={photoSrc(p.id)}
                        controls
                        playsInline
                        preload="metadata"
                        onError={() => setPlaybackFailed(true)}
                        className="max-h-full max-w-full rounded-xl"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )
                  ) : (
                    <ZoomableImage
                      ref={isActive ? zoomRef : undefined}
                      src={photoSrc(p.id)}
                      alt={p.caption ?? ""}
                      active={isActive}
                      onZoomChange={isActive ? setZoomed : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="safe-bottom flex max-w-full touch-none flex-wrap items-center justify-center gap-2 px-4 pb-4 pt-1 text-center text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <Badge tone="neutral">{PHOTO_KIND_LABEL[active.kind as PhotoKind] ?? active.kind}</Badge>
            {active.caption && <span className="text-sm">{active.caption}</span>}
            {onDelete && canDelete?.(active) && (
              confirmDelete ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">この写真を削除しますか？</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="flex min-h-[36px] items-center rounded-full bg-white/15 px-3 text-xs font-bold text-white"
                  >
                    やめる
                  </button>
                  <button
                    type="button"
                    onClick={() => runDelete(active)}
                    disabled={deleting}
                    className="flex min-h-[36px] items-center gap-1 rounded-full bg-red-600 px-3 text-xs font-bold text-white"
                  >
                    {deleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    削除する
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex min-h-[36px] items-center gap-1 rounded-full bg-white/15 px-3 text-xs font-bold text-white/90"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  削除
                </button>
              )
            )}
            {deleteError && (
              <span role="alert" className="basis-full text-xs font-semibold text-red-300">
                {deleteError}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
