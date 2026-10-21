"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** ダブルタップ・ボタンで拡大するときの倍率 */
const STEP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

type View = { s: number; x: number; y: number };
const RESET: View = { s: 1, x: 0, y: 0 };

export type ZoomableImageHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 拡大表示用の画像。スマホはピンチ・ダブルタップで拡大、拡大中は1本指で動かせる。
 * パソコンはホイール・ダブルクリック・ドラッグ（＋親のボタンから zoomIn/zoomOut）。
 * 拡大していない間は横スライド（親のスクロール）を邪魔しない。
 */
export const ZoomableImage = forwardRef<
  ZoomableImageHandle,
  {
    src: string;
    alt: string;
    /** 表示中の写真か。外れたら倍率を戻す */
    active: boolean;
    onZoomChange?: (zoomed: boolean) => void;
  }
>(function ZoomableImage({ src, alt, active, onZoomChange }, ref) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [view, setView] = useState<View>(RESET);
  const viewRef = useRef<View>(RESET);
  // 指で動かしている最中はアニメーションを切る（指に吸い付かせる）
  const [gesturing, setGesturing] = useState(false);
  const zoomChangeRef = useRef(onZoomChange);
  zoomChangeRef.current = onZoomChange;

  /** 拡大した画像が画面から外れすぎないよう、移動量を収める */
  function fit(v: View): View {
    const img = imgRef.current;
    if (!img || v.s <= 1) return RESET;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const maxX = (w * v.s - w) / 2;
    const maxY = (h * v.s - h) / 2;
    return { s: v.s, x: clamp(v.x, -maxX, maxX), y: clamp(v.y, -maxY, maxY) };
  }

  function apply(v: View) {
    viewRef.current = v;
    setView(v);
  }

  /** 画面上の点 (px, py) を動かさずに倍率を変える */
  function zoomAt(nextScale: number, px: number, py: number, from: View = viewRef.current) {
    const img = imgRef.current;
    if (!img) return;
    const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const r = img.getBoundingClientRect();
    // 変形前の画像の中心（拡大は中心基準なので、今の中心から移動量を引けば求まる）
    const cx = r.left + r.width / 2 - from.x;
    const cy = r.top + r.height / 2 - from.y;
    const lx = (px - cx - from.x) / from.s;
    const ly = (py - cy - from.y) / from.s;
    apply(fit({ s, x: px - cx - s * lx, y: py - cy - s * ly }));
  }

  function zoomCenter(nextScale: number) {
    const img = imgRef.current;
    if (!img) return;
    const r = img.getBoundingClientRect();
    zoomAt(nextScale, r.left + r.width / 2, r.top + r.height / 2);
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomCenter(viewRef.current.s < 1.5 ? STEP_SCALE : viewRef.current.s * 1.5),
    zoomOut: () => zoomCenter(viewRef.current.s / 1.5 < 1.2 ? 1 : viewRef.current.s / 1.5),
  }));

  const zoomed = view.s > 1;
  useEffect(() => {
    zoomChangeRef.current?.(zoomed);
  }, [zoomed]);

  // 別の写真へ移ったら元の大きさに戻す
  useEffect(() => {
    if (!active) apply(RESET);
  }, [active]);

  // タッチとホイールは preventDefault が要るので、passive でないリスナーを直接付ける
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let pinch: { d: number; mx: number; my: number; from: View } | null = null;
    let pan: { x: number; y: number; from: View } | null = null;
    let tap: { x: number; y: number; t: number; moved: boolean } | null = null;
    let lastTap = 0;

    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        pinch = {
          d: dist(a, b) || 1,
          mx: (a.clientX + b.clientX) / 2,
          my: (a.clientY + b.clientY) / 2,
          from: viewRef.current,
        };
        pan = null;
        tap = null;
        setGesturing(true);
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        tap = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false };
        if (viewRef.current.s > 1) {
          pan = { x: t.clientX, y: t.clientY, from: viewRef.current };
          setGesturing(true);
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const mx = (a.clientX + b.clientX) / 2;
        const my = (a.clientY + b.clientY) / 2;
        const p = pinch;
        const s = clamp((p.from.s * dist(a, b)) / p.d, MIN_SCALE * 0.8, MAX_SCALE);
        // 指の中点の下にあった場所を、今の中点に合わせる（2本指で動かしても追従）
        const img = imgRef.current;
        if (!img) return;
        const r = img.getBoundingClientRect();
        const cur = viewRef.current;
        const cx = r.left + r.width / 2 - cur.x;
        const cy = r.top + r.height / 2 - cur.y;
        const lx = (p.mx - cx - p.from.x) / p.from.s;
        const ly = (p.my - cy - p.from.y) / p.from.s;
        apply({ s, x: mx - cx - s * lx, y: my - cy - s * ly });
        return;
      }
      const t = e.touches[0];
      if (tap && t && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10) tap.moved = true;
      if (pan && t) {
        e.preventDefault();
        apply(fit({ ...pan.from, x: pan.from.x + t.clientX - pan.x, y: pan.from.y + t.clientY - pan.y }));
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (pinch && e.touches.length < 2) {
        pinch = null;
        const v = viewRef.current;
        apply(v.s < 1.05 ? RESET : fit(v));
        // 1本指が残っていれば、そのまま移動に切り替える
        const t = e.touches[0];
        pan = t && viewRef.current.s > 1 ? { x: t.clientX, y: t.clientY, from: viewRef.current } : null;
        if (!pan) setGesturing(false);
        return;
      }
      if (e.touches.length === 0) {
        pan = null;
        setGesturing(false);
        // ダブルタップ：等倍なら押した場所を拡大、拡大中なら元に戻す
        if (tap && !tap.moved && Date.now() - tap.t < DOUBLE_TAP_MS) {
          const now = Date.now();
          if (now - lastTap < DOUBLE_TAP_MS) {
            e.preventDefault();
            lastTap = 0;
            if (viewRef.current.s > 1) apply(RESET);
            else zoomAt(STEP_SCALE, tap.x, tap.y);
          } else {
            lastTap = now;
          }
        }
        tap = null;
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomAt(viewRef.current.s * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
    }

    // iPhone の Safari はピンチでページ自体を拡大しようとするので止める
    const stopGesture = (e: Event) => e.preventDefault();

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchEnd, { passive: false });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", stopGesture);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", stopGesture);
    };
    // fit/zoomAt は ref だけを読むので作り直しても挙動は変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // マウスでのドラッグ移動（拡大中のみ）
  const dragRef = useRef<{ x: number; y: number; from: View; moved: boolean } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || viewRef.current.s <= 1) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, from: viewRef.current, moved: false };
    setGesturing(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    apply(fit({ ...d.from, x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y }));
  }
  function onPointerUp() {
    if (!dragRef.current) return;
    setGesturing(false);
    // ドラッグ後のクリックで閉じないよう、少しだけ印を残す
    const moved = dragRef.current.moved;
    dragRef.current = moved ? { ...dragRef.current } : null;
    if (moved) setTimeout(() => (dragRef.current = null), 0);
  }

  return (
    <div
      ref={wrapRef}
      className={cn(
        "flex h-full w-full items-center justify-center",
        // 拡大中は指の動きを全部こちらで受ける。等倍なら横スライドは親に任せる
        zoomed ? "touch-none" : "touch-pan-x",
        zoomed && (gesturing ? "cursor-grabbing" : "cursor-grab"),
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => {
        // 拡大中は背景をタップしても閉じない（動かそうとして触れることが多いため）
        if (zoomed || dragRef.current) e.stopPropagation();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        decoding="async"
        draggable={false}
        onDoubleClick={(e) => {
          if (viewRef.current.s > 1) apply(RESET);
          else zoomAt(STEP_SCALE, e.clientX, e.clientY);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`,
          transition: gesturing ? "none" : "transform 0.2s ease-out",
        }}
        className={cn(
          "max-h-full max-w-full select-none rounded-xl object-contain will-change-transform",
          !zoomed && "cursor-zoom-in",
        )}
      />
    </div>
  );
});
