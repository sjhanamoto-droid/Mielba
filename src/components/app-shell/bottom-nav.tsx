"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navForRole } from "./nav-items";
import { AppMenu } from "./app-menu";
import { cn } from "@/lib/utils";

type MenuUser = { name: string; email: string; role: string; avatarColor: string; department: string | null };

// スマホ用のボトムナビ（md 未満のみ表示。md 以上は Sidebar）。
// navForRole は「ちょうど5件」を返す契約。末尾に「メニュー」（設定/ログアウト等）を追加する。
export function BottomNav({ role, user }: { role: string; user: MenuUser }) {
  const pathname = usePathname();
  const items = navForRole(role);

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-app -translate-x-1/2 border-t border-line bg-surface/95 shadow-nav backdrop-blur-md safe-bottom md:hidden">
      <ul className="flex items-stretch justify-around px-1">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 pt-2.5 transition-colors",
                  active ? "text-brand-600" : "text-ink-faint",
                )}
              >
                <Icon
                  className="h-6 w-6"
                  strokeWidth={active ? 2.4 : 1.9}
                  fill={active ? "currentColor" : "none"}
                  fillOpacity={active ? 0.12 : 0}
                />
                <span className={cn("text-[10px]", active ? "font-bold" : "font-medium")}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <AppMenu user={user} variant="nav" />
        </li>
      </ul>
    </nav>
  );
}
