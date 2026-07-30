"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCheck, ChevronRight } from "lucide-react";
import { markRead, markAllRead, type NotificationItem } from "./actions";
import { notificationMeta } from "./notification-meta";
import { IconBadge } from "@/components/ui/icon-badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/utils";

/**
 * 起動ゲート：アプリ(app 配下)を開いたとき、未読通知があれば全画面で最前面に表示し、
 * すべて既読にするまで背後の操作をブロックする。
 *
 * 制御方法:
 * - 初期表示の未読 `items` を props で受け取り、初回マウント時にスナップショットして state 化する。
 * - 通知タップ → その通知を既読化して一覧から除去し、href があれば遷移（残り未読が無くなればゲートを閉じる）。
 * - 「すべて確認」→ markAllRead で全既読化しゲートを閉じる。
 * - 一度閉じた（既読化アクション済み）ら二度と再表示しない（dismissed を保持し props 変化に追従しない）。
 * - 未読 0 なら何も描画しない。
 */
export function StartupGate({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const toast = useToast();
  // 初回マウント時の未読をスナップショット（以降 props が変わっても再表示しない）
  const [remaining, setRemaining] = useState(items);
  const [dismissed, setDismissed] = useState(items.length === 0);
  const [pending, startTransition] = useTransition();

  const open = !dismissed && remaining.length > 0;

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

  function openItem(n: NotificationItem) {
    const willBeEmpty = remaining.length <= 1;
    setRemaining((prev) => prev.filter((x) => x.id !== n.id));
    startTransition(async () => {
      const res = await markRead(n.id);
      if (res?.error) toast(res.error, { type: "error" });
    });
    if (n.href) router.push(n.href);
    if (willBeEmpty) setDismissed(true);
  }

  function acknowledgeAll() {
    setDismissed(true);
    startTransition(async () => {
      const res = await markAllRead();
      if (res?.error) {
        setDismissed(false);
        toast(res.error, { type: "error" });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="未読のお知らせ"
      className="fixed inset-0 z-[80] flex flex-col bg-surface-subtle animate-fade-in"
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-4 safe-top">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white">
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-ink">未読のお知らせ</p>
          <p className="text-xs text-ink-muted">
            {remaining.length}件の確認事項があります
          </p>
        </div>
      </div>

      {/* 未読一覧（タップで遷移＆既読化） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-3xl space-y-2.5">
          {remaining.map((n) => {
            const meta = notificationMeta(n.type);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className="card flex w-full items-start gap-3 p-4 text-left tap-row hover:border-line-strong hover:shadow-float"
              >
                <IconBadge icon={meta.icon} tone={meta.tone} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-ink">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 line-clamp-3 text-sm leading-relaxed text-ink-soft">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-ink-faint">{relativeTime(n.createdAt)}</p>
                </div>
                {n.href && <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-faint" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* フッター：一括確認 */}
      <div className="border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-3xl">
          <Button
            type="button"
            onClick={acknowledgeAll}
            disabled={pending}
            size="lg"
            className="w-full"
          >
            <CheckCheck className="h-5 w-5" />
            すべて確認してはじめる
          </Button>
        </div>
      </div>
    </div>
  );
}
