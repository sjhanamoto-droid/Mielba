"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { markRead, markAllRead, type NotificationItem } from "./actions";
import { notificationMeta } from "./notification-meta";
import { IconBadge } from "@/components/ui/icon-badge";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { relativeTime, cn } from "@/lib/utils";

/**
 * 通知センターの一覧UI。
 * - 未読は背景・ドットで強調。タップで href 遷移＆既読化（楽観更新）。
 * - 「すべて既読」で自分の全未読を既読化する。
 * - サーバーアクション失敗時はロールバックしてトースト表示する。
 */
export function NotificationList({ initial }: { initial: NotificationItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const hasUnread = items.some((n) => !n.read);

  function open(n: NotificationItem) {
    // 楽観的に既読化してから遷移する
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      startTransition(async () => {
        const res = await markRead(n.id);
        if (res?.error) {
          setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
          toast(res.error, { type: "error" });
        }
      });
    }
    if (n.href) router.push(n.href);
  }

  function readAll() {
    const snapshot = items;
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    startTransition(async () => {
      const res = await markAllRead();
      if (res?.error) {
        setItems(snapshot);
        toast(res.error, { type: "error" });
        return;
      }
      toast("すべて既読にしました");
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Bell className="h-6 w-6" />}
        title="通知はありません"
        description="現場・日報に関するお知らせがここに届きます"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={readAll}
          disabled={!hasUnread || pending}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <CheckCheck className="h-4 w-4" />
          すべて既読
        </button>
      </div>

      <div className="card divide-y divide-line overflow-hidden">
        {items.map((n) => {
          const meta = notificationMeta(n.type);
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => open(n)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3.5 text-left tap-row transition-colors",
                !n.read && "bg-brand-50/50 dark:bg-brand-950/20",
              )}
            >
              <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn("min-w-0 flex-1 truncate text-sm text-ink", !n.read ? "font-bold" : "font-semibold")}>
                    {n.title}
                  </p>
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="未読" />}
                </div>
                {n.body && (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">{n.body}</p>
                )}
                <p className="mt-1 text-[11px] text-ink-faint">{relativeTime(n.createdAt)}</p>
              </div>
              {n.href && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
