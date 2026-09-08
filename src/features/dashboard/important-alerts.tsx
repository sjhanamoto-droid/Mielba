"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { LinkButton } from "@/components/ui/button";

/**
 * ホーム最上部の「最初に確認」。
 *
 * 現場に出る前に必ず目を通す連絡（引き継ぎ事項・当日の配達/支給品）だけを集約する。
 * ホームの他のセクションは「見るだけ」で、確認の操作はここに一本化する。
 *
 * - 未確認が1件以上：先頭の1件を大きく出し、残りはその下に詰めて並べる
 * - 「内容を確認する」を押すと確認済みとして記録してから遷移する
 * - すべて確認済み：1行に畳む（タップで再表示できる）
 *
 * 確認状態は日付単位で localStorage に持つ（キー: home-checked-<todayKey>）。
 * 日付が変わればまた未確認に戻るため、翌日も必ず目を通すことになる。
 * サーバー状態を増やさないので、引き継ぎ自体の解決（確認して停止）は現場詳細で行う。
 */

export type AlertItem = {
  /** 確認済みを覚えるための一意キー（引き継ぎID・予定IDなど） */
  key: string;
  /** どの現場の話か（小見出し） */
  siteName?: string;
  /** 主題（太字で大きく出す） */
  title: string;
  /** 補足の一文 */
  desc?: string;
  /** 「内容を確認する」の遷移先 */
  href: string;
};

/** localStorage の中身は信用せず、文字列配列だけを受け入れる */
function readChecked(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function ImportantAlerts({
  todayKey,
  items,
}: {
  todayKey: string;
  items: AlertItem[];
}) {
  const storageKey = `home-checked-${todayKey}`;
  // SSR と一致させるため初期は「すべて未確認」で描画し、マウント後に反映する
  const [checked, setChecked] = useState<string[]>([]);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    setChecked(readChecked(storageKey));
  }, [storageKey]);

  function markChecked(key: string) {
    setChecked((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // 保存できなくても遷移は妨げない（次回また未確認で出る）
      }
      return next;
    });
  }

  // 確認する連絡が無い日は、その旨を1行だけ出す（空白にせず「無い」ことを伝える）
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink-soft">
          確認が必要な連絡はありません
        </p>
      </div>
    );
  }

  const unread = items.filter((i) => !checked.includes(i.key));

  // すべて確認済み：1行に畳む
  if (unread.length === 0 && !reopened) {
    return (
      <button
        type="button"
        onClick={() => setReopened(true)}
        className="card tap-row flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">
            確認事項 {items.length}件 は確認済み
          </p>
          <p className="truncate text-xs text-ink-muted">タップして内容を再表示</p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </button>
    );
  }

  // 再表示中（全部確認済みだが開いている）：一覧だけを出す
  if (unread.length === 0) {
    return (
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
          <h2 className="flex-1 text-sm font-bold text-ink-soft">確認済みの連絡</h2>
          <button
            type="button"
            onClick={() => setReopened(false)}
            className="flex items-center gap-0.5 text-xs font-bold text-brand-600"
          >
            畳む
            <ChevronUp className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <CompactRow key={i.key} item={i} onOpen={markChecked} />
          ))}
        </ul>
      </section>
    );
  }

  const [head, ...rest] = unread;

  return (
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700/70 dark:bg-amber-950/40">
      <div className="flex items-center gap-2">
        <AlertTriangle
          className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <h2 className="text-base font-bold text-amber-800 dark:text-amber-200">
          最初に確認
        </h2>
        <span className="ml-auto shrink-0 rounded-full border border-amber-300 bg-surface px-3 py-1 text-xs font-bold text-amber-700 dark:border-amber-700 dark:text-amber-300">
          未確認 {unread.length}件
        </span>
      </div>

      {head.siteName && (
        <p className="mt-3 truncate text-sm font-medium text-ink-soft">
          {head.siteName}
        </p>
      )}
      <p className="mt-0.5 text-lg font-bold leading-snug text-ink">{head.title}</p>
      {head.desc && <p className="mt-1 text-sm text-ink-soft">{head.desc}</p>}

      <LinkButton
        href={head.href}
        size="lg"
        className="mt-3 w-full"
        onClick={() => markChecked(head.key)}
      >
        内容を確認する
        <ArrowRight className="h-5 w-5" aria-hidden />
      </LinkButton>

      {rest.length > 0 && (
        <ul className="mt-3 divide-y divide-amber-200 overflow-hidden rounded-xl border border-amber-200 bg-surface dark:divide-amber-900/60 dark:border-amber-900/60">
          {rest.map((i) => (
            <CompactRow key={i.key} item={i} onOpen={markChecked} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** 2件目以降・確認済み一覧の1行 */
function CompactRow({
  item,
  onOpen,
}: {
  item: AlertItem;
  onOpen: (key: string) => void;
}) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={() => onOpen(item.key)}
        className="flex items-center gap-2 px-3.5 py-3 active:bg-surface-subtle"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{item.title}</p>
          {item.siteName && (
            <p className="truncate text-xs text-ink-muted">{item.siteName}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </Link>
    </li>
  );
}
