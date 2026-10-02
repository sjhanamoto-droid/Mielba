"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, Check, Clock, Loader2, MessageSquareWarning } from "lucide-react";
import { markHandoverRead } from "./actions";
import { useReadCountdown } from "./use-read-countdown";
import type { PendingHandover } from "@/lib/pending-handovers";
import { jstDateTimeLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

const FAIL_MSG = "通信に失敗しました。もう一度お試しください。";

/**
 * 引き継ぎの強制ゲート：今日入る現場に、まだ読んでいない引き継ぎがあるとき、
 * アプリ(app 配下)を開くと全画面で表示し、すべて確認するまで先に進めないようにする。
 *
 * しっかり読ませるため、
 * - 1件ずつ表示する（まとめて確認はできない）
 * - 本文を最後までスクロールし、文字数に応じた秒数が経つまで「確認しました」を押せない
 * 確認すると HandoverRead に記録され、layout が再計算されて残りが減っていく。
 * （z-[85]：未入力日報ゲート z-[90] より後ろ、未読通知ゲート z-[80] より前）
 */
export function HandoverGate({ items }: { items: PendingHandover[] }) {
  // この画面で確認したもの（id＋内容）。サーバーの再計算を待たずに次へ進める。
  // 内容が書き換わって確認が取り消された引き継ぎは別物として再表示する
  const [done, setDone] = useState<Set<string>>(new Set());
  const remaining = items.filter((h) => !done.has(readKey(h)));
  const open = remaining.length > 0;

  // 何件目か：この画面で確認した件数＋残り（再計算で増減しても崩れない）
  const confirmedHere = items.length - remaining.length;
  const total = confirmedHere + remaining.length;

  // 表示中は背景スクロールをロック
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const current = remaining[0];
  const index = confirmedHere + 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="引き継ぎの確認"
      className="fixed inset-0 z-[85] flex flex-col bg-surface-subtle animate-fade-in"
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-4 safe-top">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
          <MessageSquareWarning className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-ink">現場に行く前に引き継ぎを確認</p>
          <p className="text-xs text-ink-muted">
            1件ずつ読んで「確認しました」を押してください
          </p>
        </div>
        {total > 1 && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 tnum dark:bg-amber-950/60 dark:text-amber-200">
            {index} / {total}
          </span>
        )}
      </div>

      {/* 1件ずつ。key で切り替えるたびに待ち時間・スクロール判定をやり直す */}
      <HandoverReadCard
        key={readKey(current)}
        item={current}
        isLast={remaining.length === 1}
        onDone={() => setDone((prev) => new Set(prev).add(readKey(current)))}
      />
    </div>
  );
}

function readKey(h: PendingHandover): string {
  return `${h.id}:${h.content}`;
}

function HandoverReadCard({
  item,
  isLast,
  onDone,
}: {
  item: PendingHandover;
  isLast: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const left = useReadCountdown(item.content);

  function checkEnd() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) setReachedEnd(true);
  }

  // 本文が短くてスクロールしない場合は、最初から「最後まで見た」扱い。
  // 画面の回転・リサイズでスクロール不要になった場合も拾う
  useEffect(() => {
    checkEnd();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => checkEnd());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const ready = reachedEnd && left <= 0;

  function confirm() {
    if (!ready || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        // 引き継ぎが取り下げられていても ok が返るので、通信に成功すれば次へ進める
        await markHandoverRead(item.id);
        onDone();
      } catch {
        setError(FAIL_MSG);
      }
    });
  }

  const label = pending
    ? "記録しています…"
    : !reachedEnd
      ? "最後まで読んでください"
      : left > 0
        ? `よく読んでください（あと${left}秒）`
        : isLast
          ? "確認しました"
          : "確認しました（次へ）";

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={checkEnd}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <div>
            <p className="px-1 text-lg font-bold text-ink">{item.siteName}</p>
            <p className="px-1 text-xs text-ink-muted">
              {jstDateTimeLabel(item.createdAt)}
              {item.createdByName ? `・${item.createdByName}さんから` : ""}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/40">
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-amber-950 dark:text-amber-50">
              {item.content}
            </p>
          </div>
          {!reachedEnd && (
            <p className="flex items-center justify-center gap-1 py-2 text-xs font-semibold text-ink-muted">
              <ArrowDown className="h-4 w-4 animate-bounce" aria-hidden />
              下までスクロールしてください
            </p>
          )}
        </div>
      </div>

      {/* フッター：読み終わるまで押せない確認ボタン */}
      <div className="border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {error && (
            <p role="alert" className="text-center text-xs font-semibold text-status-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={confirm}
            disabled={!ready || pending}
            className={cn(
              "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold transition",
              ready
                ? "bg-brand-600 text-white hover:bg-brand-700"
                : "bg-surface-sunken text-ink-muted",
              "disabled:cursor-not-allowed",
            )}
          >
            {pending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : ready ? (
              <Check className="h-5 w-5" aria-hidden />
            ) : (
              <Clock className="h-5 w-5" aria-hidden />
            )}
            {label}
          </button>
          <p className="text-center text-xs text-ink-muted">
            確認した引き継ぎは、現場詳細の「引き継ぎ事項」でいつでも読み返せます
          </p>
        </div>
      </div>
    </>
  );
}
