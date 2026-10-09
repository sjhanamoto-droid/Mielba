import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { AppFrame, SIDEBAR_COOKIE } from "@/components/app-shell/app-frame";
import { StartupGate } from "@/features/notifications/startup-gate";
import { MissingReportsGate } from "@/features/reports/missing-reports-gate";
import { getMissingPastReports } from "@/lib/missing-reports";
import { HandoverGate } from "@/features/handovers/handover-gate";
import { getPendingHandovers } from "@/lib/pending-handovers";
import { NextWorkGate } from "@/features/reports/next-work-gate";
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

      {/* 起動ゲート：未読があれば全画面で最前面に表示し、既読化までブロック */}
      <StartupGate items={unread} />

      {/* 引き継ぎの強制ゲート：今日入る現場の引き継ぎを、1件ずつ読んで確認するまで先に進めない
          （z-[85]：未読ゲートより前面、未入力日報ゲートより後ろ） */}
      <HandoverGate items={pendingHandovers} />

      {/* 次回作業日の確認ゲート：日報で「未定」にした本人に、確認日が来たら決める（または延期）まで先に進めない
          （z-[87]：引き継ぎゲートより前面、未入力日報ゲートより後ろ） */}
      <NextWorkGate
        items={nextWorkChecks.map((c) => ({
          reportId: c.reportId,
          siteName: c.siteName,
          workDate: c.workDate,
          nextCheckDate: c.nextCheckDate,
        }))}
      />

      {/* 未入力日報の強制ゲート：前日以前の未入力があれば、書き終えるまで先に進めない
          （z-[90] で未読ゲートより前面。日報の入力・編集画面では自動退避する） */}
      <MissingReportsGate items={missingReports} />
    </div>
  );
}
