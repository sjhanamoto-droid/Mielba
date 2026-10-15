"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ChevronRight, ClipboardList, Moon, PenLine, Plus } from "lucide-react";
import { surveyFormHref, type MissingReport } from "@/lib/missing-reports";
import { deferReportForNightShift } from "@/features/visits/actions";

/**
 * 未入力日報の強制ゲート：前日以前（17時以降は当日も）に日報が未入力の現場があるとき、
 * アプリ(app 配下)を開くと全画面で最前面に表示し、対象をすべて書き終えるまで
 * 他画面へ進めないようにする（閉じるボタンは出さない）。
 *
 * 日報の入力・編集画面にいる間だけは自らを隠し、実際にフォームを操作できるようにする。
 * 提出すると layout が再計算され（revalidatePath("/", "layout")）、残りが減っていく。
 * すべて入力済みになれば items が空になりゲートは消える。
 * 夜勤の人は当日分・前日分（12時前）に限り「夜勤のため後で書く」で翌日12時まで猶予できる。
 */
export function MissingReportsGate({ items }: { items: MissingReport[] }) {
  const pathname = usePathname();
  // 日報を書く画面（新規/編集）と現調フォーマットではゲートを退避してフォームを触れるようにする
  const onWritingRoute =
    pathname === "/reports/new" ||
    /^\/reports\/[^/]+\/edit$/.test(pathname) ||
    /^\/sites\/[^/]+\/survey$/.test(pathname);
  const open = items.length > 0 && !onWritingRoute;
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function deferNightShift(m: MissingReport) {
    const key = `${m.siteId}:${m.dateKey}`;
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      const res = await deferReportForNightShift(m.siteId, m.dateKey);
      if (res.error) setError(res.error);
      setPendingKey(null);
    });
  }

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
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 animate-fade-in"
    >
      {/* 後ろの画面の上に重ねるモーダル */}
      <div className="flex max-h-[88dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl bg-surface shadow-float">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-4">
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
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-subtle px-4 py-4">
        <div className="space-y-2.5">
          <p className="px-1 pb-1 text-sm leading-relaxed text-ink-soft">
            下記の現場の日報を入力してください。
          </p>
          {items.map((m) => {
            // 現調中の現場（下書きの日報が無いもの）は現調フォーマットへ。それ以外は日報へ
            const toSurvey = m.siteInSurvey && !m.draftReportId;
            const href = toSurvey
              ? surveyFormHref(m.siteId)
              : m.draftReportId
                ? `/reports/${m.draftReportId}/edit`
                : `/reports/new?siteId=${m.siteId}&date=${m.dateKey}`;
            const label = toSurvey
              ? "現調フォーマットを書く"
              : m.draftReportId
                ? "続きを書く"
                : "日報を書く";
            const key = `${m.siteId}:${m.dateKey}`;
            return (
              <div key={key} className="space-y-1.5">
              <Link
                href={href}
                className="card flex w-full items-center gap-3 p-4 text-left tap-row hover:border-line-strong hover:shadow-float"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-status-danger dark:bg-red-950/40">
                  {toSurvey ? (
                    <ClipboardList className="h-5 w-5" />
                  ) : m.draftReportId ? (
                    <PenLine className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-ink">{m.siteName}</p>
                  <p className="mt-0.5 text-xs font-medium text-ink-muted">
                    {m.dateLabel}
                    {toSurvey ? "・現調" : m.draftReportId ? "・下書きあり" : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-brand-600">
                  {label}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
              {m.canDeferNightShift && (
                <button
                  type="button"
                  onClick={() => deferNightShift(m)}
                  disabled={pendingKey !== null}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] font-bold text-ink-soft tap-row hover:border-line-strong disabled:opacity-50"
                >
                  <Moon className="h-4 w-4" />
                  {pendingKey === key ? "保存中…" : "夜勤のため後で書く（明日12時まで）"}
                </button>
              )}
              </div>
            );
          })}
          {error && (
            <p role="alert" className="px-1 text-sm font-medium text-status-danger">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* フッター：閉じるボタンは出さず、案内のみ */}
      <div className="border-t border-line bg-surface px-4 py-3">
        <p className="text-center text-xs text-ink-muted">
          すべて入力すると、この画面は自動的に閉じます
        </p>
      </div>
      </div>
    </div>
  );
}
