"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navForRole } from "./nav-items";
import { cn } from "@/lib/utils";

// スマホ用のボトムナビ（md 未満のみ表示。md 以上は Sidebar）。
// 設定・ログアウト等のメニューはホーム右上の「…」（/menu）から開く。
// 選択中のタブは塗りアイコン＋ラベル下のバーで示す。
export function BottomNav({ role }: { role: string; unreadCount?: number }) {
  const pathname = usePathname();
  const items = navForRole(role);

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-app -translate-x-1/2 border-t border-line bg-surface safe-bottom md:hidden">
      <ul className="flex items-stretch justify-around px-2">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 pb-1.5 pt-3 transition-colors",
                  active ? "text-[#245f4b] dark:text-brand-700" : "text-ink-soft",
                )}
              >
                <Icon
                  className="h-7 w-7"
                  strokeWidth={active ? 2.2 : 1.7}
                  fill={active ? "currentColor" : "none"}
                  fillOpacity={active ? 1 : 0}
                />
                <span className={cn("text-xs", active ? "font-bold" : "font-medium")}>
                  {item.label}
                </span>
                <span
                  aria-hidden
                  className={cn("mt-0.5 h-1 w-7 rounded-full", active ? "bg-[#245f4b] dark:bg-brand-700" : "bg-transparent")}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
