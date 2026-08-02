"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  HardHat, MapPin, Sun, ChevronRight, ChevronDown, CheckCircle2,
  ShieldAlert, FileText, ArrowRight,
} from "lucide-react";
import { IconBadge } from "@/components/ui/icon-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton, Button } from "@/components/ui/button";
import { mapSearchUrl, cn } from "@/lib/utils";

/**
 * ホーム最上部の「今日/明日の現場」確認ゲート（クライアント）。
 *
 * - 今日・明日の現場入りを大きく目立つカードで表示する。
 * - 「確認しました」を押すまで大きく残し、押したら通常サイズ（1行サマリー）に畳む。
 * - 確認状態は日付単位で localStorage に保持（キー: home-confirm-<todayKey>）。
 *   日付が変われば todayKey が変わるため再度確認を促す（サーバー状態は増やさない）。
 * - SSR を壊さないため初期は「未確認（展開）」で描画し、マウント後に確認済みを反映する
 *   （初回描画はサーバーと一致 → ハイドレーション不一致なし）。
 */

export type HeroSite = {
  visitId: string;
  siteId: string;
  name: string;
  address: string | null;
  note: string | null;
  // 日報導線（今日のみ）。明日は undefined。
  reportStatus?: "NONE" | "DRAFT" | "SUBMITTED";
  reportId?: string | null;
};

type Props = {
  todayKey: string; // YYYY-MM-DD（localStorage キー・日付単位判定に使用）
  todayLabel: string; // 例: 8/2(土)（サーバー整形済み）
  tomorrowLabel: string;
  today: HeroSite[];
  tomorrow: HeroSite[];
};

function reportHref(s: HeroSite): string {
  if (s.reportStatus === "SUBMITTED" && s.reportId) return `/reports/${s.reportId}`;
  if (s.reportStatus === "DRAFT" && s.reportId) return `/reports/${s.reportId}/edit`;
  return `/reports/new?siteId=${s.siteId}`;
}

function reportCta(s: HeroSite): string {
  if (s.reportStatus === "SUBMITTED") return "日報を見る";
  if (s.reportStatus === "DRAFT") return "下書きを開く";
  return "日報を書く";
}

// 住所（タップで地図アプリを開く）
function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={mapSearchUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-1 text-sm font-medium text-brand-600"
    >
      <MapPin className="h-4 w-4 shrink-0" />
      <span className="truncate underline underline-offset-2">{address}</span>
    </a>
  );
}

export function TodayConfirm({ todayKey, todayLabel, tomorrowLabel, today, tomorrow }: Props) {
  const storageKey = `home-confirm-${todayKey}`;
  const hasVisits = today.length > 0 || tomorrow.length > 0;

  // 初回は未確認（展開）で描画 → マウント後に localStorage を反映
  const [confirmed, setConfirmed] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "1") {
        setConfirmed(true);
        setOpen(false);
      }
    } catch {
      // localStorage が使えない環境では常に未確認扱い（描画は継続）
    }
  }, [storageKey]);

  function confirm() {
    setConfirmed(true);
    setOpen(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // 保持できなくても UI は畳む
    }
  }

  // 確認する対象が無い日は、控えめな空状態のみ（ゲートは出さない）
  if (!hasVisits) {
    return (
      <section className="space-y-2.5">
        <SectionHeader confirmed={false} showBadge={false} />
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-4">
          <IconBadge icon={HardHat} tone="slate" size="sm" />
          <p className="text-sm text-ink-muted">今日・明日の現場入りはありません</p>
        </div>
      </section>
    );
  }

  // 確認済みかつ畳まれている：1行サマリー（タップで再展開）
  if (confirmed && !open) {
    return (
      <section className="space-y-2.5">
        <SectionHeader confirmed showBadge />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="card flex w-full items-center gap-3 px-4 py-3 text-left tap-row"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">
              今日 {today.length}件・明日 {tomorrow.length}件 の現場を確認済み
            </p>
            <p className="truncate text-xs text-ink-muted">タップして詳細を再表示</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
        </button>
      </section>
    );
  }

  // 展開表示（未確認 or 再表示中）：今日/明日を大きく
  return (
    <section className="space-y-3">
      <SectionHeader confirmed={confirmed} showBadge />

      {/* 今日の現場 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold text-white">今日</span>
          <span className="text-xs font-semibold text-ink-muted">{todayLabel}</span>
        </div>
        {today.length > 0 ? (
          <div className="space-y-2.5">
            {today.map((s) => (
              <div
                key={s.visitId}
                className="rounded-2xl border-2 border-brand-500/70 bg-brand-50/70 p-4 dark:border-brand-500/40 dark:bg-brand-950/30"
              >
                <div className="flex items-start gap-3">
                  <IconBadge icon={HardHat} tone="brand" size="lg" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/sites/${s.siteId}`}
                      className="block truncate text-lg font-bold leading-snug text-ink"
                    >
                      {s.name}
                    </Link>
                    {s.note && (
                      <p className="mt-0.5 truncate text-sm font-medium text-ink-soft">{s.note}</p>
                    )}
                  </div>
                </div>
                {s.address && <AddressLink address={s.address} />}
                <div className="mt-3 flex gap-2">
                  <LinkButton href={`/sites/${s.siteId}`} variant="outline" size="md" className="flex-1">
                    現場詳細
                    <ChevronRight className="h-4 w-4" />
                  </LinkButton>
                  <LinkButton href={reportHref(s)} size="md" className="flex-1">
                    <FileText className="h-4 w-4" />
                    {reportCta(s)}
                  </LinkButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyDay label="今日の現場入りはありません" />
        )}
      </div>

      {/* 明日の現場 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-white">明日</span>
          <span className="text-xs font-semibold text-ink-muted">{tomorrowLabel}</span>
        </div>
        {tomorrow.length > 0 ? (
          <div className="space-y-2.5">
            {tomorrow.map((s) => (
              <div
                key={s.visitId}
                className="rounded-2xl border-2 border-amber-400/70 bg-amber-50/70 p-4 dark:border-amber-500/40 dark:bg-amber-950/30"
              >
                <div className="flex items-start gap-3">
                  <IconBadge icon={Sun} tone="amber" size="lg" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/sites/${s.siteId}`}
                      className="block truncate text-lg font-bold leading-snug text-ink"
                    >
                      {s.name}
                    </Link>
                    {s.note && (
                      <p className="mt-0.5 truncate text-sm font-medium text-ink-soft">{s.note}</p>
                    )}
                  </div>
                </div>
                {s.address && <AddressLink address={s.address} />}
                <div className="mt-3">
                  <LinkButton href={`/sites/${s.siteId}`} variant="outline" size="md" className="w-full">
                    現場詳細
                    <ChevronRight className="h-4 w-4" />
                  </LinkButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyDay label="明日の現場入りはありません" />
        )}
      </div>

      {/* 確認ゲート：押すまで大きく残る */}
      {!confirmed ? (
        <Button type="button" onClick={confirm} size="lg" className="w-full">
          <CheckCircle2 className="h-5 w-5" />
          確認しました
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-surface-subtle py-2.5 text-sm font-bold text-ink-muted active:scale-[0.99]"
        >
          畳む
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

function SectionHeader({ confirmed, showBadge }: { confirmed: boolean; showBadge: boolean }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-sm font-bold text-ink-soft">今日・明日の現場</h2>
      {showBadge &&
        (confirmed ? (
          <Badge tone="active">
            <CheckCircle2 className="h-3 w-3" />
            確認済み
          </Badge>
        ) : (
          <Badge tone="warn" className="border border-amber-300 font-bold dark:border-amber-700/60">
            <ShieldAlert className="h-3 w-3" />
            未確認
          </Badge>
        ))}
    </div>
  );
}

function EmptyDay({ label }: { label: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-line-strong bg-surface/50 px-4 py-3.5 text-center")}>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}
