"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { markHandoverRead } from "./actions";
import type { PendingHandover } from "@/lib/pending-handovers";
import { jstDateTimeLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

const FAIL_MSG = "通信に失敗しました。もう一度お試しください。";

/**
 * 引き継ぎの強制ゲート：今日入る現場に、まだ読んでいない引き継ぎがあるとき、
 * アプリ(app 配下)を開くと全画面で表示し、すべて確認するまで先に進めないようにする。
 *
 * しっかり読ませるため、
 * - 1件ずつ表示する（まとめて確認はできない。上部のステップで何件目かを示す）
 * - 本文を最後までスクロールし、「内容を確認しました」にチェックを入れるまで次へ進めない
 * 確認すると HandoverRead に記録され、layout が再計算されて残りが減っていく。
 * （z-[85]：未入力日報ゲート z-[90] より後ろ、未読通知ゲート z-[80] より前）
 */
export function HandoverGate({ items }: { items: PendingHandover[] }) {
  // この画面で確認したもの（id＋内容）。サーバーの再計算を待たずに次へ進める。
  // 内容が書き換わって確認が取り消された引き継ぎは別物として再表示する
  const [done, setDone] = useState<Set<string>>(new Set());
  // この画面で見せた引き継ぎを覚えておく。確認するとサーバー側の一覧(items)から
  // 消えるため、items だけで数えると「1/3 → 1/2」と件数が減ってしまう。
  // 確認済みは残し、新しく増えたものは後ろに足す（3件なら 1→2→3 と進む）。
  const [seen, setSeen] = useState<PendingHandover[]>(items);
  const seenKeys = new Set(seen.map(readKey));
  const added = items.filter((h) => !seenKeys.has(readKey(h)));
  if (added.length > 0) {
    // 前回分をすべて確認し終えたあとに新しく出てきたら、1件目から数え直す
    const allDone = seen.every((h) => done.has(readKey(h)));
    if (allDone) {
      setSeen(items);
      setDone(new Set());
    } else {
      setSeen([...seen, ...added]);
    }
  }

  // 確認していないのに一覧から消えたもの（取り下げ・対応完了）は数えない
  const live = new Set(items.map(readKey));
  const list = [...seen, ...added].filter((h) => done.has(readKey(h)) || live.has(readKey(h)));
  const remaining = list.filter((h) => !done.has(readKey(h)));
  const open = remaining.length > 0;

  // 何件目か：この画面で確認した件数＋1／全件数
  const confirmedHere = list.length - remaining.length;
  const total = list.length;

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
      className="fixed inset-0 z-[85] flex items-stretch justify-center bg-surface-subtle animate-fade-in md:items-center md:p-6"
    >
      {/* 1件ずつ。key で切り替えるたびにスクロール判定・チェックをやり直す */}
      <HandoverReadCard
        key={readKey(current)}
        item={current}
        index={index}
        total={total}
        isLast={remaining.length === 1}
        onDone={() => setDone((prev) => new Set(prev).add(readKey(current)))}
      />
    </div>
  );
}

function readKey(h: PendingHandover): string {
  return `${h.id}:${h.content}`;
}

// 何件目かのステップ（1 — 2 — 3）。済み＝チェック、今＝琥珀色、これから＝グレー
function Steps({ index, total }: { index: number; total: number }) {
  const small = total > 5; // 件数が多いときは丸を小さくして1行に収める
  return (
    <ol className="flex items-center" aria-label={`${total}件中${index}件目`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const state = n < index ? "done" : n === index ? "current" : "todo";
        return (
          <li key={n} className={cn("flex items-center", n > 1 && "flex-1")}>
            {n > 1 && (
              <span
                aria-hidden
                className={cn(
                  "mx-2 h-0.5 flex-1 rounded-full",
                  n <= index ? "bg-amber-300" : "bg-line",
                )}
              />
            )}
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full font-bold tnum transition-colors",
                small ? "h-8 w-8 text-sm" : "h-11 w-11 text-base",
                state === "current" && "bg-amber-500 text-white ring-[5px] ring-amber-100 dark:ring-amber-900/50",
                state === "done" && "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
                state === "todo" && "bg-surface-sunken text-ink-muted",
              )}
            >
              {state === "done" ? <Check className="h-4 w-4" aria-hidden /> : n}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function HandoverReadCard({
  item,
  index,
  total,
  isLast,
  onDone,
}: {
  item: PendingHandover;
  index: number;
  total: number;
  isLast: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [checked, setChecked] = useState(false);

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

  const ready = reachedEnd && checked;

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

  const no = String(index).padStart(2, "0");

  return (
    <div className="flex w-full flex-col overflow-hidden bg-surface md:max-h-[92vh] md:max-w-[400px] md:rounded-2xl md:border md:border-line md:shadow-float">
      {/* ヘッダー：見出し・件数・現場名・ステップ */}
      <div className="shrink-0 px-6 pb-6 pt-7 safe-top">
        <p className="text-xs font-medium tracking-[0.15em] text-ink-muted">現場に行く前に</p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-wide text-ink">引き継ぎを確認</h2>
          <p className="shrink-0 tnum text-ink-muted">
            <span className="text-xl font-bold text-ink">{index}</span>
            <span className="text-sm"> / {total}件</span>
          </p>
        </div>
        <p className="mt-2.5 break-words text-sm text-ink-muted">{item.siteName}</p>
        <div className="mt-5">
          <Steps index={index} total={total} />
        </div>
      </div>

      {/* 本文（グレーの帯）。長いときはここだけスクロール */}
      <div
        ref={scrollRef}
        onScroll={checkEnd}
        className="min-h-[180px] flex-1 overflow-y-auto border-y border-line bg-surface-subtle px-6 py-6"
      >
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold tracking-wider text-ink-soft">
              引き継ぎ事項 / <span className="tnum">{no}</span>
            </p>
            <p className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" aria-hidden />
              要確認
            </p>
          </div>
          <p className="mt-5 whitespace-pre-wrap break-words border-l-[3px] border-amber-500 pl-5 text-[17px] leading-[2] tracking-wide text-ink">
            {item.content}
          </p>
        </div>
      </div>

      {/* フッター：差出人・案内・チェック・ボタン */}
      <div className="shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5">
        <p className="text-xs text-ink-muted tnum">
          {item.createdByName ? `${item.createdByName}さんから · ` : ""}
          {jstDateTimeLabel(item.createdAt)}
        </p>
        <p className="mt-6 text-center text-xs tracking-wide text-ink-muted">
          {reachedEnd
            ? isLast
              ? "内容を確認すると、引き継ぎの確認が終わります"
              : "内容を確認すると、次の引き継ぎへ進めます"
            : "本文を最後までスクロールしてください"}
        </p>
        <div className="mt-4 border-t border-line pt-4">
          <label
            className={cn(
              "flex min-h-[44px] cursor-pointer items-center gap-3 text-base font-medium text-ink",
              !reachedEnd && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={!reachedEnd || pending}
              onChange={(e) => setChecked(e.target.checked)}
              className="h-6 w-6 shrink-0 rounded-md accent-amber-500"
            />
            内容を確認しました
          </label>
          {error && (
            <p role="alert" className="mt-2 text-center text-xs font-semibold text-status-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={confirm}
            disabled={!ready || pending}
            className={cn(
              "mt-4 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl px-4 text-base font-bold tracking-wide transition",
              ready
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-surface-sunken text-ink-muted",
              "disabled:cursor-not-allowed",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                記録しています…
              </>
            ) : (
              <>
                {isLast ? "確認して閉じる" : "確認してから次へ"}
                <ArrowRight className="h-5 w-5" aria-hidden />
              </>
            )}
          </button>
          <p className="mt-4 text-center text-xs text-ink-muted">
            確認した内容は、現場詳細の「引き継ぎ事項」で読み返せます
          </p>
        </div>
      </div>
    </div>
  );
}
