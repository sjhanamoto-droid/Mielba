"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, HardHat } from "lucide-react";
import { Input } from "@/components/ui/form";
import { SITE_STATUS_LABEL, type SiteStatus } from "@/lib/constants";

export type PickerSite = {
  id: string;
  name: string;
  siteStatus: string;
  customerName: string;
  materialCount: number;
};

// 材料OCR登録の起点。現場を検索して選ぶ（選ぶと撮影画面へ遷移）。
export function MaterialSitePicker({ sites }: { sites: PickerSite[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return sites;
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(kw) || s.customerName.toLowerCase().includes(kw),
    );
  }, [q, sites]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="現場名・顧客名で検索"
          className="pl-9"
          aria-label="現場を検索"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface-subtle px-4 py-6 text-center text-sm text-ink-muted">
          該当する現場がありません
        </p>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {filtered.map((s) => (
            <Link
              key={s.id}
              href={`/materials/${s.id}`}
              className="tap-row flex items-center gap-3 p-4 active:bg-surface-sunken"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <HardHat className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-ink">{s.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {s.customerName} ・ {SITE_STATUS_LABEL[s.siteStatus as SiteStatus] ?? s.siteStatus}
                  {s.materialCount > 0 && ` ・ 登録材料 ${s.materialCount}件`}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
