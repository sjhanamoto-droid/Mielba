"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";

export const SIDEBAR_COOKIE = "mielba_sidebar";

// サイドバー（開閉可）＋コンテンツのオフセットを一体管理するクライアントシェル。
// 開閉状態は cookie に保存し、次回以降ちらつき無しで復元する。
export function AppFrame({
  user,
  initialCollapsed,
  unreadCount = 0,
  children,
}: {
  user: {
    name: string;
    email: string;
    role: string;
    avatarColor: string;
    avatarImage: string | null;
    department: string | null;
  };
  initialCollapsed: boolean;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  return (
    <>
      <Sidebar user={user} collapsed={collapsed} onToggle={toggle} unreadCount={unreadCount} />
      <div
        className={cn(
          "transition-[padding] duration-200",
          collapsed ? "md:pl-[72px]" : "md:pl-60 lg:pl-64",
        )}
      >
        <div className="app-container min-h-dvh pb-nav md:mx-0 md:max-w-none md:pb-0">
          {children}
        </div>
      </div>
    </>
  );
}
