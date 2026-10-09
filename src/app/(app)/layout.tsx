import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { AppFrame, SIDEBAR_COOKIE } from "@/components/app-shell/app-frame";
import { getMissingPastReports } from "@/lib/missing-reports";
import { GateStack } from "@/features/gates/gate-stack";
import { getPendingHandovers } from "@/lib/pending-handovers";
import { getDueNextWorkChecks } from "@/lib/next-work";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const store = await cookies();
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "1";

  // 起動ゲート＆通知バッジ用の未読データ＋前日以前の未入力日報＋今日の現場の未確認の引き継ぎ（本人のみ）。
  const [unreadCount, unread, missingReports, pendingHandovers, nextWorkChecks] = await Promise.all([
    db.notification.count({ where: { userId: user.id, read: false } }),
    db.notification.findMany({
      where: { userId: user.id, read: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        read: true,
        createdAt: true,
      },
    }),
    getMissingPastReports(user.id),
    getPendingHandovers(user.id),
    getDueNextWorkChecks(user.id),
  ]);

  return (
    <div className="min-h-dvh bg-surface-subtle">
      {/* PC / タブレット：開閉できるサイドバー＋コンテンツ */}
      <AppFrame user={user} initialCollapsed={collapsed} unreadCount={unreadCount}>
        {children}
      </AppFrame>

      {/* スマホ：ボトムナビ（md 未満のみ）。末尾に「メニュー」（設定/ログアウト等） */}
      <BottomNav role={user.role} unreadCount={unreadCount} />

      {/* アプリを開いたときの確認モーダル。優先順に1つずつ出す
          （未入力日報 → 次回作業日 → 引き継ぎ → 未読のお知らせ。日報の入力画面では退く） */}
      <GateStack
        missingReports={missingReports}
        nextWorkChecks={nextWorkChecks.map((c) => ({
          reportId: c.reportId,
          siteName: c.siteName,
          workDate: c.workDate,
          nextCheckDate: c.nextCheckDate,
        }))}
        pendingHandovers={pendingHandovers}
        unread={unread}
      />
    </div>
  );
}
