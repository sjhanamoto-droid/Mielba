"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { closeHandover, markHandoverRead, reopenHandover } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { jstDateTimeLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

// 現場の引き継ぎ事項パネル（対応中＋対応完了の履歴）。
// 「確認しました」は本人の既読だけを記録し、他の人の画面からは消えない。誰が確認したかも見える。
// 「対応完了」は起票者・管理者が閉じる操作で、誤って閉じても「対応中に戻す」で戻せる。

export interface HandoverPanelOpenItem {
  id: string;
  content: string;
  createdAt: Date | string;
  createdByName?: string;
  readers: { name: string; readAt: Date | string }[];
  unreadNames: string[];
  visitors: { name: string; readAt: Date | string | null }[];
  readByMe: boolean;
  canClose: boolean;
}

export interface HandoverPanelResolvedItem {
  id: string;
  content: string;
  createdAt: Date | string;
  createdByName?: string;
  resolvedAt?: Date | string;
  resolvedByName?: string;
}

type ActionResult = { ok?: boolean; error?: string } | void;

const FAIL_MSG = "通信に失敗しました。もう一度お試しください。";

function meta(item: { createdAt: Date | string; createdByName?: string }): string {
  const when = jstDateTimeLabel(item.createdAt);
  return item.createdByName ? `${when}・${item.createdByName}` : when;
}

export function HandoverPanel({
  open,
  resolved,
  children,
}: {
  /** 対応中（新しい順） */
  open: HandoverPanelOpenItem[];
  /** 対応完了（新しい順・直近ぶんのみ） */
  resolved: HandoverPanelResolvedItem[];
  /** 対応中の引き継ぎと完了履歴の間に置く内容（現場の常設メモなど） */
  children?: ReactNode;
}) {
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // この画面で閉じた引き継ぎ。直後に「戻す」ボタンを見つけられるよう履歴を開いた状態にする
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);

  const autoOpen = resolved.some((h) => touched.has(h.id));
  const historyOpen = showHistory || autoOpen;
  const unreadByMe = open.filter((h) => !h.readByMe).length;
  // 自分がまだ確認していないものを先に（それぞれの中は元の並び）
  const ordered = [...open].sort((a, b) => Number(a.readByMe) - Number(b.readByMe));
  // 今日この現場に入る人のうち、まだ読んでいない人がいる引き継ぎがあるか
  const teamUnread = open.some((h) => h.unreadNames.length > 0);

  function run(id: string, fn: () => Promise<ActionResult>) {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && "error" in res && res.error) setError(res.error);
        else setTouched((prev) => new Set(prev).add(id));
      } catch {
        setError(FAIL_MSG);
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-2.5">
      {/* 対応中：今日の担当に未確認があれば赤い注意を先頭に */}
      {open.length > 0 && (teamUnread || unreadByMe > 0) && (
        <div className="rounded-2xl border border-red-200 border-t-4 border-t-red-500 bg-red-50/70 px-4 py-3.5 dark:border-red-900/60 dark:border-t-red-500 dark:bg-red-950/30">
          <p className="flex items-center gap-2 text-base font-bold text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            {teamUnread ? "今日の担当に未確認があります" : `あなたが未確認の引き継ぎが${unreadByMe}件あります`}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {teamUnread ? "各引き継ぎの確認状況を確認してください。" : "内容を読んで「確認しました」を押してください。"}
          </p>
        </div>
      )}

      {/* 対応中の引き継ぎ（隠さず全件を開いた状態で並べる） */}
      {open.length > 0 && (
        <ol className="space-y-3">
          {ordered.map((h, i) => (
            <OpenHandoverItem
              // 内容が書き換わったらチェックをやり直す
              key={`${h.id}:${h.content}`}
              item={h}
              no={i + 1}
              busy={busyId === h.id}
              onRead={() => run(h.id, () => markHandoverRead(h.id))}
              onClose={() => run(h.id, () => closeHandover(h.id))}
            />
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" className="px-1 text-xs font-semibold text-status-danger">
          {error}
        </p>
      )}

      {children}

      {/* 対応完了：読み返せる・対応中に戻せる */}
      {resolved.length > 0 && (
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => {
              // 自動で開いている状態から閉じる場合も含め、押したら必ず表示が切り替わる
              if (historyOpen) {
                setShowHistory(false);
                setTouched(new Set());
              } else {
                setShowHistory(true);
              }
            }}
            aria-expanded={historyOpen}
            className="flex min-h-[48px] w-full items-center gap-2 px-4 text-sm font-semibold text-ink-soft hover:bg-surface-subtle"
          >
            <History className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            対応完了の引き継ぎ
            <span className="rounded-full bg-surface-sunken px-1.5 text-xs font-bold text-ink-muted tnum">
              {resolved.length}
            </span>
            {historyOpen ? (
              <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            ) : (
              <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            )}
          </button>

          {historyOpen && (
            <ul className="divide-y divide-line border-t border-line">
              {resolved.map((h) => {
                const busy = busyId === h.id;
                return (
                  <li key={h.id} className="px-4 py-3">
                    <ClampedText
                      text={h.content}
                      className="text-sm leading-relaxed text-ink-soft"
                      toggleClassName="text-brand-600"
                    />
                    <p className="mt-1 text-xs text-ink-faint">
                      {meta(h)}
                      {h.resolvedAt && (
                        <>
                          {" ／ "}
                          {jstDateTimeLabel(h.resolvedAt)} に
                          {h.resolvedByName ? `${h.resolvedByName}が` : ""}対応完了
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => run(h.id, () => reopenHandover(h.id))}
                      disabled={busy}
                      className={cn(
                        buttonClass({ variant: "outline", size: "sm", className: "mt-2" }),
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw className="h-4 w-4" aria-hidden />
                      )}
                      対応中に戻す
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function OpenHandoverItem({
  item,
  no,
  busy,
  onRead,
  onClose,
}: {
  item: HandoverPanelOpenItem;
  no: number;
  busy: boolean;
  onRead: () => void;
  onClose: () => void;
}) {
  // 「内容を確認しました」にチェックを入れてから確認できる
  const [checked, setChecked] = useState(false);
  const unread = !item.readByMe;
  const num = String(no).padStart(2, "0");

  return (
    <li className="card overflow-hidden">
      <div className="px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm tracking-wider text-ink-muted tnum">引き継ぎ {num}</p>
          {unread ? (
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
              要確認
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCheck className="h-4 w-4" aria-hidden />
              あなたは確認済み
            </span>
          )}
        </div>
        {/* 対応中の引き継ぎは長文でも畳まず全文を出す */}
        <p className="mt-3 whitespace-pre-wrap break-words text-lg leading-[1.9] text-ink">{item.content}</p>
        <p className="mt-3 text-xs text-ink-muted tnum">{meta(item)}</p>
      </div>

      {/* 今日の担当者の確認状況（未確認は赤い行） */}
      {item.visitors.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs text-ink-muted">今日の担当者の確認状況</p>
          <ul className="mt-2 space-y-1">
            {item.visitors.map((v) =>
              v.readAt ? (
                <li key={v.name} className="flex items-start justify-between gap-3 px-3 py-1.5 text-sm">
                  <span className="text-ink-soft">{v.name}</span>
                  <span className="text-right text-emerald-700 dark:text-emerald-300">
                    <span className="flex items-center justify-end gap-1">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      確認済み
                    </span>
                    <span className="block text-xs tnum">{jstDateTimeLabel(v.readAt)}</span>
                  </span>
                </li>
              ) : (
                <li
                  key={v.name}
                  className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400"
                >
                  <span>{v.name}</span>
                  <span className="font-semibold">未確認</span>
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {/* 自分が未確認なら、チェックしてから確認。書いた人・管理者は対応完了にできる */}
      {(unread || item.canClose) && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          {unread && (
            <>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base font-medium text-ink">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="h-6 w-6 shrink-0 rounded-md accent-brand-600"
                />
                内容を確認しました
              </label>
              <button
                type="button"
                onClick={onRead}
                disabled={busy || !checked}
                className={cn(
                  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-bold transition disabled:cursor-not-allowed",
                  checked ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-surface-sunken text-ink-muted",
                )}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Check className="h-5 w-5" aria-hidden />}
                確認しました
              </button>
            </>
          )}
          {item.canClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={buttonClass({ variant: "outline", size: "sm", className: "w-full" })}
            >
              対応完了にする
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** 4行を超える長文は畳み、「全文を表示」で開く（長い引き継ぎで画面が埋まらないように） */
function ClampedText({
  text,
  className,
  toggleClassName,
}: {
  text: string;
  className?: string;
  toggleClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // 行数は折り返し幅に依存するので、改行数と文字数でおおよそ判定する
  const long = text.split(/\r?\n/).length > 4 || text.length > 120;
  return (
    <div>
      <p
        className={cn(
          "whitespace-pre-wrap break-words",
          long && !expanded && "line-clamp-4",
          className,
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            "mt-1 inline-flex min-h-[32px] items-center gap-0.5 text-xs font-bold",
            toggleClassName,
          )}
        >
          {expanded ? "たたむ" : "全文を表示"}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}
