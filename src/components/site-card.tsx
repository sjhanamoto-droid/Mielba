"use client";

import { MapPin, ChevronRight } from "lucide-react";
import { CardLink } from "@/components/ui/card";
import { SiteStatusBadge, Badge } from "@/components/ui/badge";
import { PROJECT_TYPE_LABEL, type ProjectType } from "@/lib/constants";
import { cn } from "@/lib/utils";

// 住所 → Google マップ検索 URL は @/lib/utils に移動（サーバーコンポーネントからも使うため）
import { mapSearchUrl } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken", className)}>
      <div
        className="h-full rounded-full bg-brand-500 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export type SiteCardData = {
  id: string;
  name: string;
  address: string | null;
  siteStatus: string;
  projectType: string;
  progressRate: number;
  customer?: { name: string } | null;
};

export function SiteCard({
  site,
  meta,
}: {
  site: SiteCardData;
  meta?: React.ReactNode;
}) {
  return (
    <CardLink href={`/sites/${site.id}`} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <SiteStatusBadge status={site.siteStatus} />
            <Badge tone="neutral">
              {PROJECT_TYPE_LABEL[site.projectType as ProjectType] ?? site.projectType}
            </Badge>
          </div>
          <h3 className="truncate text-[15px] font-bold leading-snug text-ink">
            {site.name}
          </h3>
          {site.customer && (
            <p className="mt-0.5 truncate text-xs font-medium text-brand-600">
              {site.customer.name}
            </p>
          )}
          {site.address && (
            // カード全体が <Link> のため、住所は role="link" で地図アプリを開く
            // （preventDefault + stopPropagation でカード遷移と両立）
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-muted">
              <MapPin className="h-3 w-3 shrink-0 text-brand-500" />
              <span
                role="link"
                tabIndex={0}
                aria-label={`${site.address} を地図で開く`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(mapSearchUrl(site.address!), "_blank", "noopener,noreferrer");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(mapSearchUrl(site.address!), "_blank", "noopener,noreferrer");
                  }
                }}
                className="truncate underline decoration-line-strong underline-offset-2 hover:text-brand-600"
              >
                {site.address}
              </span>
            </p>
          )}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-faint" />
      </div>

      {site.siteStatus === "ACTIVE" && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-ink-muted">
            <span>進捗</span>
            <span className="tnum text-ink-soft">{site.progressRate}%</span>
          </div>
          <ProgressBar value={site.progressRate} />
        </div>
      )}

      {meta && <div className="mt-3 border-t border-line pt-2.5">{meta}</div>}
    </CardLink>
  );
}
