import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { AppFrame, SIDEBAR_COOKIE } from "@/components/app-shell/app-frame";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const store = await cookies();
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="min-h-dvh bg-surface-subtle">
      {/* PC / タブレット：開閉できるサイドバー＋コンテンツ */}
      <AppFrame user={user} initialCollapsed={collapsed}>
        {children}
      </AppFrame>

      {/* スマホ：ボトムナビ（md 未満のみ）。末尾に「メニュー」（設定/ログアウト等） */}
      <BottomNav role={user.role} user={user} />
    </div>
  );
}
