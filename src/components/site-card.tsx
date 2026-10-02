"use client";

import { MapPin, ChevronRight, AlertTriangle, Building2 } from "lucide-react";
import { CardLink } from "@/components/ui/card";
import { Badge, SiteStatusBadge } from "@/components/ui/badge";
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
    // 幅の狭い端末では横スクロールに逃がす（ラベルは縮まないため、はみ出させない）
    <div
      className={cn("flex items-stretch gap-1 overflow-x-auto", className)}
      aria-label="進捗ステータス"
    >
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
  provisional?: boolean;
  customer?: { name: string } | null;
  createdByName?: string;
};

export function SiteCard({
  site,
  meta,
}: {
  site: SiteCardData;
  meta?: React.ReactNode;
}) {
  const stageless = site.siteStatus === "SURVEY" || site.siteStatus === "DECLINED";
  return (
    <CardLink href={`/sites/${site.id}`} className="p-4">
      {/* 1行目：工事区分（軽く）と状態ピル。仮登録は目立たせる */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {site.provisional && (
            <Badge tone="warn" className="shrink-0 border border-amber-300 font-bold dark:border-amber-700/60">
              <AlertTriangle className="h-3 w-3" />
              仮登録
            </Badge>
          )}
          <span className="truncate text-sm font-semibold text-ink-muted">
            {PROJECT_TYPE_LABEL[site.projectType as ProjectType] ?? site.projectType}
          </span>
        </div>
        <SiteStatusBadge status={site.siteStatus} className="shrink-0 px-3 py-1 text-sm font-bold" />
      </div>

      {/* 現場名を一番大きく */}
      <div className="mt-1.5 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 min-w-0 flex-1 break-words text-lg font-bold leading-snug text-ink [text-wrap:pretty]">
          {site.name}
        </h3>
        <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </div>

      {/* メタ行：顧客・住所 */}
      {site.customer && (
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
          <Building2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
          <span className="truncate">{site.customer.name}</span>
        </p>
      )}
      {site.address && (
        // カード全体が <Link> のため、住所は role="link" で地図アプリを開く
        // （preventDefault + stopPropagation でカード遷移と両立）
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
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
            className="min-w-0 truncate font-medium text-brand-600"
          >
            {site.address}
          </span>
        </p>
      )}

      {/* 進捗ステータス（配線→…→完了。現在地のみ点灯）。
          現調・見送りの現場はまだ工程が始まっていないので出さない（状態ピルだけ）。 */}
      {!stageless && (
        <SiteStageStepper
          index={siteStageIndex(site.siteStatus, site.projectStatus)}
          className="mt-3"
        />
      )}
      {site.createdByName && (
        <p className="mt-2 truncate text-xs text-ink-faint">作成者: {site.createdByName}</p>
      )}

      {meta && <div className="mt-3 border-t border-line pt-2.5">{meta}</div>}
    </CardLink>
  );
}
