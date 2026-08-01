"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, Check, RefreshCw, Users, AlertCircle, Hourglass } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { voteMain, type MainVoteState } from "./main-vote-actions";
import { cn } from "@/lib/utils";

/**
 * メインの人ゲート：その日・その現場の配員が「メインの人」を全員一致で選ぶまで
 * 日報フォームに進めない。全員の投票が同じ人になったら consensus が確定し、
 * router.refresh() でフォーム画面（ReportForm）へ切り替わる。
 *
 * 制御方法:
 * - 初期状態を props(initial) で受け取り state 化。投票は voteMain を呼び楽観更新。
 * - consensus 確定（state.consensus 非null）で router.refresh → ページ側が ReportForm を出す。
 * - 未一致の間は ~10秒ごとに自動 router.refresh し、他メンバーの投票を取り込む。
 * - router.refresh でページが再取得した最新の initial を state に反映する。
 */
export function MainVoteGate({
  siteId,
  dateKey,
  siteName,
  initial,
}: {
  siteId: string;
  dateKey: string;
  siteName: string;
  initial: MainVoteState;
}) {
  const router = useRouter();
  const [state, setState] = useState<MainVoteState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // router.refresh でページが再取得した最新の投票状況を取り込む
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    setState(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  // consensus 成立でフォーム画面へ
  useEffect(() => {
    if (state.consensus) router.refresh();
  }, [state.consensus, router]);

  // 未一致の間は ~10秒ごとに自動更新（他メンバーの投票を取り込む）
  useEffect(() => {
    if (state.consensus) return;
    const t = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(t);
  }, [state.consensus, router]);

  function vote(mainUserId: string) {
    if (pending) return;
    setError(null);
    // 楽観更新：自分の選択を即時反映
    setState((prev) => ({ ...prev, myVote: mainUserId }));
    startTransition(async () => {
      const res = await voteMain(siteId, dateKey, mainUserId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setState(res);
    });
  }

  const nameOf = (userId: string) =>
    state.members.find((m) => m.userId === userId)?.name ?? "不明";

  const votedCount = state.members.filter((m) => m.vote).length;
  const distinctVotes = new Set(
    state.members.filter((m) => m.vote).map((m) => m.vote),
  );
  const allVoted = state.members.every((m) => m.vote);
  const split = distinctVotes.size > 1;

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="card space-y-1.5 p-4">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Crown} tone="amber" size="md" />
          <div className="min-w-0">
            <p className="text-base font-bold text-ink">メインの人を決める</p>
            <p className="text-xs text-ink-muted truncate">{siteName}</p>
          </div>
        </div>
        <p className="text-sm text-ink-soft">
          その日の配員 <span className="font-bold">{state.members.length}名</span> 全員が
          同じ人を選ぶと日報に進めます。材料・在庫はメインの人が入力します。
        </p>
      </div>

      {/* メイン候補（自分の投票先を選ぶ） */}
      <div className="space-y-2.5">
        <span className="flex items-center gap-1.5 px-1 text-sm font-semibold text-ink-soft">
          <Users className="h-4 w-4" />
          あなたが選ぶメインの人
        </span>
        <div className="space-y-2">
          {state.members.map((m) => {
            const selected = state.myVote === m.userId;
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => vote(m.userId)}
                disabled={pending}
                aria-pressed={selected}
                className={cn(
                  "flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99]",
                  selected
                    ? "border-brand-400 bg-brand-50 dark:bg-brand-950/40"
                    : "border-line-strong bg-surface",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                    selected
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line-strong text-transparent",
                  )}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1 text-[15px] font-bold text-ink">
                  {m.name}
                </span>
                {selected && (
                  <span className="shrink-0 text-xs font-bold text-brand-600">
                    投票中
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="alert-danger flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 全員の投票状況 */}
      <div className="space-y-2.5">
        <span className="flex items-center gap-1.5 px-1 text-sm font-semibold text-ink-soft">
          投票状況（{votedCount}/{state.members.length} 名）
        </span>
        <div className="card divide-y divide-line p-0">
          {state.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {m.name}
              </span>
              {m.vote ? (
                <span className="shrink-0 text-xs font-bold text-brand-700 dark:text-brand-300">
                  → {nameOf(m.vote)} に投票
                </span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-ink-faint">
                  未投票
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 状態メッセージ */}
      {split ? (
        <div className="alert-warn flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          投票が分かれています。全員で同じ人に投票してください。
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink-soft">
          <Hourglass className="h-4 w-4 shrink-0 text-ink-muted" />
          {allVoted
            ? "集計中です…"
            : "他のメンバーの投票を待っています。"}
        </div>
      )}

      {/* 手動更新 */}
      <button
        type="button"
        onClick={() => router.refresh()}
        className={buttonClass({ variant: "outline", size: "lg", className: "w-full" })}
      >
        <RefreshCw className="h-5 w-5" />
        最新の投票状況に更新
      </button>
    </div>
  );
}
