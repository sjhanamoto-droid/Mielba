"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LogOut, Settings, X, ChevronRight, Menu,
  Building2, UserCog,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { logoutAction } from "@/features/auth/actions";

// ヘッダー右上のメニュー。アバター単独だと押せると気づきにくいので
// 「メニュー」ラベル付きのボタンにする。シート内に役割別のショートカットを整理する。
export function AppMenu({
  user,
}: {
  user: { name: string; email: string; role: string; avatarColor: string; department: string | null };
}) {
  const [open, setOpen] = useState(false);
  const admin = user.role === "ADMIN";

  const shortcuts = admin
    ? [
        { href: "/customers", label: "顧客（元請企業）", icon: Building2 },
        { href: "/settings/staff", label: "スタッフ管理", icon: UserCog },
        { href: "/settings", label: "設定", icon: Settings },
      ]
    : [{ href: "/settings", label: "設定", icon: Settings }];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="メニューを開く"
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1.5 pr-3 text-ink-soft shadow-card active:scale-95"
      >
        <Avatar name={user.name} color={user.avatarColor} size="sm" />
        <Menu className="h-4 w-4" aria-hidden />
        <span className="text-xs font-bold">メニュー</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-app rounded-t-3xl bg-surface p-5 pb-8 animate-slide-up safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">メニュー</h2>
              <button onClick={() => setOpen(false)} aria-label="閉じる" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-surface-subtle p-3">
              <Avatar name={user.name} color={user.avatarColor} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
                <p className="mt-0.5 text-xs font-semibold text-brand-600">
                  {ROLE_LABEL[user.role as Role]}
                  {user.department && ` ・ ${user.department}`}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              {shortcuts.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-ink-soft active:bg-surface-sunken"
                >
                  <Icon className="h-5 w-5" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="h-4 w-4 text-ink-faint" />
                </Link>
              ))}
              <form action={logoutAction}>
                <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-status-danger active:bg-red-50">
                  <LogOut className="h-5 w-5" />
                  ログアウト
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
