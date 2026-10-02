"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { closeHandover, markHandoverRead, reopenHandover } from "./actions";
import { useReadCountdown } from "./use-read-countdown";
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
      {/* 対応中：現場に入る前に必ず読むもの */}
      {open.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            <p className="text-sm font-bold">
              対応中の引き継ぎが{open.length}件あります
              {unreadByMe > 0 && `（あなたは${unreadByMe}件未確認）`}
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {open.map((h) => (
              <OpenHandoverItem
                // 内容が書き換わったら待ち時間を数え直す
                key={`${h.id}:${h.content}`}
                item={h}
                busy={busyId === h.id}
                onRead={() => run(h.id, () => markHandoverRead(h.id))}
                onClose={() => run(h.id, () => closeHandover(h.id))}
              />
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-300/80">
            「確認しました」は自分の分だけ記録され、他の人の画面からは消えません。
            対応が終わったら、書いた人か管理者が「対応完了」にしてください。
          </p>
        </div>
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
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
                      {h.content}
                    </p>
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
  busy,
  onRead,
  onClose,
}: {
  item: HandoverPanelOpenItem;
  busy: boolean;
  onRead: () => void;
  onClose: () => void;
}) {
  // 未確認のときだけ、読む時間を取ってから押せるようにする
  const left = useReadCountdown(item.content, !item.readByMe);

  return (
    <li className="rounded-xl border border-amber-200/70 bg-white/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
      <p className="whitespace-pre-wrap break-words text-sm text-amber-900 dark:text-amber-100">
        {item.content}
      </p>
      <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">{meta(item)}</p>

      {/* 確認状況：誰がいつ読んだか／今日入るのにまだの人 */}
      {(item.readers.length > 0 || item.unreadNames.length > 0) && (
        <div className="mt-2 space-y-0.5 text-xs">
          {item.readers.length > 0 && (
            <p className="text-emerald-700 dark:text-emerald-300">
              <CheckCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
              確認済み：
              {item.readers.map((r) => `${r.name}（${jstDateTimeLabel(r.readAt)}）`).join("、")}
            </p>
          )}
          {item.unreadNames.length > 0 && (
            <p className="font-semibold text-status-danger">
              今日の担当で未確認：{item.unreadNames.join("、")}
            </p>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {item.readByMe ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" aria-hidden />
            あなたは確認済み
          </span>
        ) : (
          <button
            type="button"
            onClick={onRead}
            disabled={busy || left > 0}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : left > 0 ? (
              <Clock className="h-4 w-4" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
            {left > 0 ? `よく読んでください（あと${left}秒）` : "確認しました"}
          </button>
        )}
        {item.canClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={buttonClass({ variant: "outline", size: "sm", className: "ml-auto" })}
          >
            対応完了にする
          </button>
        )}
      </div>
    </li>
  );
}
