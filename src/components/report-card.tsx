import Link from "next/link";
import { Clock, ImageIcon, MessageSquare, Package, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { fmtMonthDay, workHours, cn } from "@/lib/utils";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/constants";

export type ReportCardData = {
  id: string;
  workDate: Date | string;
  startTime: string;
  endTime: string;
  detail: string | null;
  status: string;
  user: { name: string; avatarColor: string };
  site?: { id: string; name: string } | null;
  _count?: { photos: number; comments: number; materials: number };
};

export function ReportCard({
  report,
  showSite,
  showDate = true,
}: {
  report: ReportCardData;
  showSite?: boolean;
  showDate?: boolean;
}) {
  const submitted = report.status === "SUBMITTED";
  return (
    <Link
      href={`/reports/${report.id}`}
      className="card tap-row block p-4 transition-all hover:border-line-strong hover:shadow-float"
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={report.user.name} color={report.user.avatarColor} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-ink">{report.user.name}</span>
            <Badge tone={submitted ? "active" : "warn"}>
              {REPORT_STATUS_LABEL[report.status as ReportStatus]}
            </Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
            {showDate && <span className="font-medium">{fmtMonthDay(report.workDate)}</span>}
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {report.startTime}–{report.endTime}
              <span className="text-ink-faint">（{workHours(report.startTime, report.endTime)}）</span>
            </span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
      </div>

      {showSite && report.site && (
        <p className="mt-2 truncate text-xs font-semibold text-brand-600">{report.site.name}</p>
      )}

      {report.detail && (
        <p className={cn("mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft")}>
          {report.detail}
        </p>
      )}

      {report._count && (
        <div className="mt-2.5 flex items-center gap-3 text-xs text-ink-muted">
          {report._count.photos > 0 && (
            <span className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{report._count.photos}</span>
          )}
          {report._count.materials > 0 && (
            <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{report._count.materials}</span>
          )}
          {report._count.comments > 0 && (
            <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{report._count.comments}</span>
          )}
        </div>
      )}
    </Link>
  );
}
