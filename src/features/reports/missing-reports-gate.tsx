"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ChevronRight, PenLine, Plus } from "lucide-react";
import type { MissingReport } from "@/lib/missing-reports";

/**
 * 未入力日報の強制ゲート：前日以前に日報が未入力の現場があるとき、
 * アプリ(app 配下)を開くと全画面で最前面に表示し、対象をすべて書き終えるまで
 * 他画面へ進めないようにする（閉じるボタンは出さない）。
 *
 * 日報の入力・編集画面にいる間だけは自らを隠し、実際にフォームを操作できるようにする。
 * 提出すると layout が再計算され（revalidatePath("/", "layout")）、残りが減っていく。
 * すべて入力済みになれば items が空になりゲートは消える。
 */
export function MissingReportsGate({ items }: { items: MissingReport[] }) {
  const pathname = usePathname();
  // 日報を書く画面（新規/編集）ではゲートを退避してフォームを触れるようにする
  const onWritingRoute =
    pathname === "/reports/new" || /^\/reports\/[^/]+\/edit$/.test(pathname);
  const open = items.length > 0 && !onWritingRoute;

  // 表示中は背景スクロールをロック
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="未入力の日報"
      className="fixed inset-0 z-[90] flex flex-col bg-surface-subtle animate-fade-in"
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-4 safe-top">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-status-danger text-white">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-ink">未入力の日報があります</p>
          <p className="text-xs text-ink-muted">
            {items.length}件の日報を入力するまで先に進めません
          </p>
        </div>
      </div>

      {/* 未入力一覧（タップで該当日の日報作成／下書きの続きへ） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-3xl space-y-2.5">
          <p className="px-1 pb-1 text-sm leading-relaxed text-ink-soft">
            日を過ぎても入力できます。現場ごとに、その日の作業内容・勤怠を入力してください。
          </p>
          {items.map((m) => {
            const href = m.draftReportId
              ? `/reports/${m.draftReportId}/edit`
              : `/reports/new?siteId=${m.siteId}&date=${m.dateKey}`;
            return (
              <Link
                key={`${m.siteId}:${m.dateKey}`}
                href={href}
                className="card flex w-full items-center gap-3 p-4 text-left tap-row hover:border-line-strong hover:shadow-float"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-status-danger dark:bg-red-950/40">
                  {m.draftReportId ? <PenLine className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-ink">{m.siteName}</p>
                  <p className="mt-0.5 text-xs font-medium text-ink-muted">
                    {m.dateLabel}
                    {m.draftReportId ? "・下書きあり" : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-brand-600">
                  {m.draftReportId ? "続きを書く" : "日報を書く"}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* フッター：閉じるボタンは出さず、案内のみ */}
      <div className="border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-center text-xs text-ink-muted">
            すべて入力すると、この画面は自動的に閉じます
          </p>
        </div>
      </div>
    </div>
  );
}
