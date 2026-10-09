"use client";

import { usePathname } from "next/navigation";
import type { MissingReport } from "@/lib/missing-reports";
import type { PendingHandover } from "@/lib/pending-handovers";
import type { NotificationItem } from "@/features/notifications/actions";
import { MissingReportsGate } from "@/features/reports/missing-reports-gate";
import { NextWorkGate, type NextWorkCheckItem } from "@/features/reports/next-work-gate";
import { HandoverGate } from "@/features/handovers/handover-gate";
import { StartupGate } from "@/features/notifications/startup-gate";

/**
 * アプリを開いたときの確認モーダルを、優先順に「1つずつ」出す。
 *   ① 未入力の日報（前日以前） → ② 次回作業日の確認 → ③ 引き継ぎ → ④ 未読のお知らせ
 * 以前は4つが同時に重なって開き、日報を書きに行くと（①が退く）④の「すべて確認」が
 * フォームの上に出て、それを押して進む形になっていた。上位が残っている間は下位を出さない。
 * 日報・現調の入力画面では、フォームを操作できるよう全部を退かせる。
 */
export function GateStack({
  missingReports,
  nextWorkChecks,
  pendingHandovers,
  unread,
}: {
  missingReports: MissingReport[];
  nextWorkChecks: NextWorkCheckItem[];
  pendingHandovers: PendingHandover[];
  unread: NotificationItem[];
}) {
  const pathname = usePathname();
  const onWritingRoute =
    pathname === "/reports/new" ||
    /^\/reports\/[^/]+\/edit$/.test(pathname) ||
    /^\/sites\/[^/]+\/survey$/.test(pathname);
  if (onWritingRoute) return null;

  if (missingReports.length > 0) return <MissingReportsGate items={missingReports} />;
  if (nextWorkChecks.length > 0) return <NextWorkGate items={nextWorkChecks} />;
  if (pendingHandovers.length > 0) return <HandoverGate items={pendingHandovers} />;
  return <StartupGate items={unread} />;
}
