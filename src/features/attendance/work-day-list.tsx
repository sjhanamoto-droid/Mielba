import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, HardHat, Briefcase } from "lucide-react";
import { dateFromKey } from "@/lib/date";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { fmtWorkMinutes, fmtDateWithDay } from "@/lib/utils";
import type { WorkDay } from "./work-days";

// 月の切り替え（‹ 2026年10月 ›）
export function MonthNav({
  monthLabel,
  isCurrent,
  prevHref,
  nextHref,
}: {
  monthLabel: string;
  isCurrent: boolean;
  prevHref: string;
  nextHref: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={prevHref}
        aria-label="前月"
        className={buttonClass({ variant: "outline", size: "icon" })}
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <div className="flex items-center gap-2">
        <p className="text-xl font-bold text-ink tnum">{monthLabel}</p>
        {isCurrent && (
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
            今月
          </span>
        )}
      </div>
      <Link
        href={nextHref}
        aria-label="翌月"
        className={buttonClass({ variant: "outline", size: "icon" })}
      >
        <ChevronRight className="h-5 w-5" />
      </Link>
    </div>
  );
}

// 稼働時間の日別内訳（日報は日報詳細へリンク、事務所作業はリンクなし）
export function WorkDayList({ days }: { days: WorkDay[] }) {
  return (
    <>
      {days.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-6 w-6" />}
          title="この月の稼働はまだありません"
          description="日報の提出、または「事務所作業」の予定を入れると、日ごとの稼働がここに表示されます。"
        />
      ) : (
        <div className="space-y-3">
          {days.map(([key, d]) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <p className="text-lg font-bold text-ink tnum">{fmtDateWithDay(dateFromKey(key))}</p>
                <p className="text-base font-bold text-brand-600 tnum">{fmtWorkMinutes(d.minutes)}</p>
              </div>
              <Card className="divide-y divide-line overflow-hidden">
                {d.rows.map((row) =>
                  row.office ? (
                    <div key={row.key} className="flex items-center gap-3 px-4 py-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <Briefcase className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-ink">{row.siteName}</p>
                        <p className="text-sm text-ink-muted tnum">
                          {row.start}〜{row.end}
                        </p>
                      </div>
                      <p className="shrink-0 text-base font-bold text-ink tnum">
                        {fmtWorkMinutes(row.minutes)}
                      </p>
                    </div>
                  ) : (
                    <Link
                      key={row.key}
                      href={`/reports/${row.reportId}`}
                      className="flex items-center gap-3 px-4 py-3.5 tap-row"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                        <HardHat className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-ink">{row.siteName}</p>
                        <p className="text-sm text-ink-muted tnum">
                          {row.start}〜{row.end}
                        </p>
                      </div>
                      <p className="shrink-0 text-base font-bold text-ink tnum">
                        {fmtWorkMinutes(row.minutes)}
                      </p>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                    </Link>
                  ),
                )}
              </Card>
            </div>
          ))}
        </div>
      )}
      <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
        各行は提出済みの日報の作業時間（終了−開始）です。下書きの日報は計上されません。「事務所作業」の予定も稼働に含みます（終日は 8:00〜17:00）。日跨ぎは想定せず、時刻が未設定・異常な場合は 0 として扱います。
      </p>
    </>
  );
}
