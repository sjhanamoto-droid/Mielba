import Link from "next/link";
import { ImageIcon, MessageSquare, Package, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { fmtMonthDay, workHours, cn } from "@/lib/utils";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/constants";

export type ReportCardData = {
  id: string;
  workDate: Date | string;
  startTime: string;
  endTime: string;
  detail: string | null;
  status: string;
  user: { name: string; avatarColor: string; avatarImage?: string | null };
  site?: { id: string; name: string } | null;
  _count?: { photos: number; comments: number; materials: number };
};

/** 日報の状態ピル（提出済み＝緑 ／ 下書き＝琥珀） */
export function ReportStatusPill({ status, className }: { status: string; className?: string }) {
  const submitted = status === "SUBMITTED";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
        submitted
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
        className,
      )}
    >
      {REPORT_STATUS_LABEL[status as ReportStatus] ?? status}
    </span>
  );
}

/**
 * 日報の1件。
 * variant="card"（既定）は単独の白いカード、"row" は一覧カード（card divide-y）の中の1行。
 */
export function ReportCard({
  report,
  showSite,
  showDate = true,
  variant = "card",
}: {
  report: ReportCardData;
  showSite?: boolean;
  showDate?: boolean;
  variant?: "card" | "row";
}) {
  const counts = report._count;
  const hasCounts = counts && counts.photos + counts.materials + counts.comments > 0;
  return (
    <Link
      href={`/reports/${report.id}`}
      className={cn(
        "tap-row flex items-start gap-3",
        variant === "card"
          ? "card p-4 transition-all hover:border-line-strong hover:shadow-float"
          : "px-4 py-3.5",
      )}
    >
      <Avatar name={report.user.name} color={report.user.avatarColor} image={report.user.avatarImage} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-bold text-ink">{report.user.name}</span>
          <ReportStatusPill status={report.status} />
        </div>
        {showSite && report.site && (
          <p className="mt-0.5 truncate text-sm font-semibold text-brand-600">{report.site.name}</p>
        )}
        <p className="mt-0.5 truncate text-sm text-ink-muted tnum">
          {showDate && <span className="font-medium">{fmtMonthDay(report.workDate)} ・ </span>}
          {report.startTime}–{report.endTime}
          <span className="text-ink-faint">（{workHours(report.startTime, report.endTime)}）</span>
        </p>

        {report.detail && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{report.detail}</p>
        )}

        {hasCounts && (
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
            {counts.photos > 0 && (
              <span className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{counts.photos}</span>
            )}
            {counts.materials > 0 && (
              <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{counts.materials}</span>
            )}
            {counts.comments > 0 && (
              <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{counts.comments}</span>
            )}
          </div>
        )}
      </div>
      <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
    </Link>
  );
}
