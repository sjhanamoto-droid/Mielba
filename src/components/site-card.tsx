"use client";

import { MapPin, ChevronRight } from "lucide-react";
import { CardLink } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PROJECT_TYPE_LABEL, SITE_STAGES, siteStageIndex, type ProjectType } from "@/lib/constants";
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

// 横並びの進捗ステッパー。現在地のセグメントだけをブランドカラーで点灯する。
export function SiteStageStepper({
  index,
  className,
}: {
  index: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-stretch gap-1", className)} aria-label="進捗ステータス">
      {SITE_STAGES.map((label, i) => {
        const active = i === index;
        return (
          <span
            key={label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex-1 rounded-md px-1 py-1 text-center text-[10px] font-bold leading-none tracking-tight whitespace-nowrap transition-colors",
              active
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-surface-sunken text-ink-faint",
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

export type SiteCardData = {
  id: string;
  name: string;
  address: string | null;
  siteStatus: string;
  projectType: string;
  projectStatus: string;
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
      {/* 進捗ステータス（現調→見積り→受注→施工中→完了。現在地のみ点灯） */}
      <SiteStageStepper
        index={siteStageIndex(site.siteStatus, site.projectStatus)}
        className="mb-2.5"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5">
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

      {meta && <div className="mt-3 border-t border-line pt-2.5">{meta}</div>}
    </CardLink>
  );
}
