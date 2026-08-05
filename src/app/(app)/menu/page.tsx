import Link from "next/link";
import {
  LogOut, Settings, ChevronRight, Bell,
  Building2, UserCog, Clock, Lightbulb, type LucideIcon,
} from "lucide-react";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { logoutAction } from "@/features/auth/actions";

// スマホ用のメニュー（旧：ボトムシートのモーダル）を独立した1ページに。
// 役割別のショートカット・通知・ログアウトを整理して表示する。
export default async function MenuPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const unreadCount = await db.notification.count({
    where: { userId: user.id, read: false },
  });

  const shortcuts: { href: string; label: string; icon: LucideIcon }[] = admin
    ? [
        { href: "/customers", label: "顧客（元請企業）", icon: Building2 },
        { href: "/attendance", label: "稼働時間", icon: Clock },
        { href: "/settings/staff", label: "スタッフ管理", icon: UserCog },
        { href: "/help", label: "使い方・ヒント", icon: Lightbulb },
        { href: "/settings", label: "設定", icon: Settings },
      ]
    : [
        { href: "/help", label: "使い方・ヒント", icon: Lightbulb },
        { href: "/settings", label: "設定", icon: Settings },
      ];

  return (
    <div>
      <PageHeader title="メニュー" />
      <PageContainer size="narrow">
        <div className="space-y-5">
          {/* プロフィール */}
          <div className="card flex items-center gap-3.5 p-4">
            <Avatar name={user.name} color={user.avatarColor} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
              <p className="mt-0.5 text-xs font-semibold text-brand-600">
                {ROLE_LABEL[user.role as Role]}
                {user.department && ` ・ ${user.department}`}
              </p>
            </div>
          </div>

          {/* メニュー項目 */}
          <div className="card divide-y divide-line overflow-hidden">
            <Link
              href="/notifications"
              className="tap-row flex items-center gap-3.5 p-4 active:bg-surface-sunken"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Bell className="h-5 w-5" />
              </span>
              <span className="flex-1 text-[15px] font-bold text-ink">通知</span>
              {unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
            </Link>
            {shortcuts.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="tap-row flex items-center gap-3.5 p-4 active:bg-surface-sunken"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1 text-[15px] font-bold text-ink">{label}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
              </Link>
            ))}
          </div>

          {/* ログアウト */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="card flex w-full items-center gap-3.5 p-4 text-status-danger active:bg-red-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-status-danger">
                <LogOut className="h-5 w-5" />
              </span>
              <span className="flex-1 text-left text-[15px] font-bold">ログアウト</span>
            </button>
          </form>
        </div>
      </PageContainer>
    </div>
  );
}
