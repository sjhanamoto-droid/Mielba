"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Truck } from "lucide-react";

// ホーム最下部の「その他の連絡事項」（当日の配達・支給品など）。
// 引き継ぎは「今日の現場」に載せるので、ここはそれ以外の連絡だけ。
// 未確認があれば行で出し、すべて開いたら「確認済み」の1行に畳む。
// 確認状態は日付単位で localStorage に持つ（キー: home-checked-<todayKey>）。

export type NoticeItem = {
  key: string;
  title: string;
  /** 現場名・時刻などの補足 */
  desc?: string;
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

export function OtherNotices({ todayKey, items }: { todayKey: string; items: NoticeItem[] }) {
  const storageKey = `home-checked-${todayKey}`;
  // SSR と一致させるため初期は「すべて未確認」で描画し、マウント後に反映する
  const [checked, setChecked] = useState<string[]>([]);

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
        // 保存できなくても遷移は妨げない
      }
      return next;
    });
  }

  const unread = items.filter((i) => !checked.includes(i.key));

  if (unread.length === 0) {
    return (
      <p className="flex items-center gap-3 py-4 text-sm text-ink-muted">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-ink-faint" strokeWidth={1.6} aria-hidden />
        {items.length === 0 ? "その他の連絡事項はありません" : "その他の連絡事項は確認済み"}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {unread.map((i) => (
        <li key={i.key}>
          <Link
            href={i.href}
            onClick={() => markChecked(i.key)}
            className="flex items-center gap-3 py-4 active:opacity-70"
          >
            <Truck className="h-6 w-6 shrink-0 text-amber-600" strokeWidth={1.8} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-ink">{i.title}</p>
              {i.desc && <p className="truncate text-sm text-ink-muted">{i.desc}</p>}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
