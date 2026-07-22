"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, HardHat, Loader2, ChevronLeft, ChevronRight, Users, X,
} from "lucide-react";
import Link from "next/link";
import { toggleVisit } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Staff = { id: string; name: string; avatarColor: string };
type DispatchUser = { id: string; name: string; avatarColor: string; role: string };
// 当日の日報状況: none=未打刻 / draft=下書き / submitted=提出済
export type ReportStatus = "none" | "draft" | "submitted";
type SiteRow = {
  id: string;
  name: string;
  customerName: string | null;
  staff: Staff[];
  visitedIds: string[];
  /** userId → 当日の日報状況（現場入りONの人の提出状況表示に使う） */
  reportStatusByUserId?: Record<string, ReportStatus>;
};

// 日報状況のドット（未打刻=赤 / 下書き=黄 / 提出済=緑）
function StatusDot({ status }: { status: ReportStatus }) {
  const cls =
    status === "submitted"
      ? "bg-emerald-500"
      : status === "draft"
        ? "bg-amber-400"
        : "bg-red-500";
  const label =
    status === "submitted" ? "日報 提出済" : status === "draft" ? "日報 下書き" : "日報 未打刻";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface", cls)}
    />
  );
}

// 日付送りナビ（クライアント）。router.push + useTransition で
// 低速回線でも「反応していない」ように見えないようスピナーを出す。
export function DispatchDateNav({
  prevKey,
  nextKey,
  isToday,
  label,
}: {
  prevKey: string;
  nextKey: string;
  isToday: boolean;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go(key: string | null) {
    startTransition(() => {
      router.push(key ? `/dispatch?d=${key}` : "/dispatch");
    });
  }

  return (
    <div className={cn("mb-4 flex items-center justify-between gap-2", isPending && "opacity-60")}>
      <button
        type="button"
        onClick={() => go(prevKey)}
        disabled={isPending}
        aria-label="前の日"
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken disabled:opacity-50"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div className="text-center">
        <p className="flex items-center justify-center gap-1.5 text-base font-bold text-ink tnum md:text-lg">
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />}
          {label}
        </p>
        {!isToday && (
          <button
            type="button"
            onClick={() => go(null)}
            disabled={isPending}
            className="text-xs font-semibold text-brand-600 disabled:opacity-50"
          >
            今日に戻る
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => go(nextKey)}
        disabled={isPending}
        aria-label="次の日"
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken disabled:opacity-50"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}

export function DispatchBoard({
  sites,
  dateStr,
  allUsers,
}: {
  sites: SiteRow[];
  dateStr: string;
  allUsers: DispatchUser[];
}) {
  const toast = useToast();
  const [, start] = useTransition();
  // 配員編集シートを開いている現場ID（null=閉）
  const [editSiteId, setEditSiteId] = useState<string | null>(null);
  // セル単位の pending（`${siteId}_${userId}`）。1タップで全ボタンをロックしない。
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [visited, setVisited] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {};
    for (const s of sites) m[s.id] = new Set(s.visitedIds);
    return m;
  });

  function toggle(siteId: string, userId: string) {
    const key = `${siteId}_${userId}`;
    if (pendingKeys.has(key)) return; // 同一セルの多重タップは無視
    const was = visited[siteId]?.has(userId) ?? false;
    // 楽観的更新
    setVisited((prev) => {
      const n = { ...prev };
      const set = new Set(n[siteId]);
      if (was) set.delete(userId);
      else set.add(userId);
      n[siteId] = set;
      return n;
    });
    setPendingKeys((prev) => new Set(prev).add(key));
    start(async () => {
      const r = await toggleVisit(siteId, userId, dateStr);
      setPendingKeys((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
      if (r?.error) {
        toast(r.error, { type: "error" });
        // 失敗時は戻す
        setVisited((prev) => {
          const n = { ...prev };
          const set = new Set(n[siteId]);
          if (was) set.add(userId);
          else set.delete(userId);
          n[siteId] = set;
          return n;
        });
      }
    });
  }

  // pill 表示用: userId → 表示情報（allUsers を基本に、当日訪問者の情報も補完）
  const userById = new Map<string, Staff>();
  for (const u of allUsers) userById.set(u.id, { id: u.id, name: u.name, avatarColor: u.avatarColor });
  for (const s of sites) for (const u of s.staff) if (!userById.has(u.id)) userById.set(u.id, u);

  const totalGoing = sites.reduce((acc, s) => acc + (visited[s.id]?.size ?? 0), 0);
  const editSite = editSiteId ? sites.find((s) => s.id === editSiteId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3">
        <span className="text-sm font-semibold text-brand-700">この日の現場入り 合計</span>
        <span className="text-lg font-bold tnum text-brand-700">{totalGoing}名</span>
      </div>

      <div className="space-y-3">
        {sites.map((s) => {
          const visitorIds = [...(visited[s.id] ?? [])];
          const goingCount = visitorIds.length;
          return (
            <div key={s.id} className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/sites/${s.id}`} className="block truncate text-[15px] font-bold text-ink">
                    {s.name}
                  </Link>
                  {s.customerName && (
                    <p className="truncate text-xs text-ink-muted">{s.customerName}</p>
                  )}
                </div>
                <span className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                  goingCount > 0
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-surface-sunken text-ink-muted",
                )}>
                  {goingCount}名
                </span>
              </div>

              {goingCount === 0 ? (
                <p className="text-sm text-ink-muted">この日に現場入りする人はいません</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {visitorIds.map((uid) => {
                    const u = userById.get(uid);
                    if (!u) return null;
                    const cellPending = pendingKeys.has(`${s.id}_${uid}`);
                    const reportStatus = s.reportStatusByUserId?.[uid] ?? "none";
                    return (
                      <button
                        key={uid}
                        type="button"
                        onClick={() => toggle(s.id, uid)}
                        disabled={cellPending}
                        aria-label={`${u.name} を当日から外す`}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border border-brand-600 bg-brand-600 py-1 pl-1 pr-3 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60",
                        )}
                      >
                        <span className="relative">
                          <Avatar name={u.name} color={u.avatarColor} size="sm" />
                          {/* 現場入り中の人に、当日の日報状況をドットで表示 */}
                          {!cellPending && <StatusDot status={reportStatus} />}
                        </span>
                        {u.name}
                        {cellPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <X className="h-3.5 w-3.5 opacity-80" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 配員を編集（配属0名の現場でも表示） */}
              <button
                type="button"
                onClick={() => setEditSiteId(s.id)}
                className="mt-3 flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-bold text-ink-soft active:scale-95"
              >
                <Users className="h-4 w-4 text-brand-600" aria-hidden />
                配員を編集
              </button>
            </div>
          );
        })}
      </div>

      {sites.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong py-12 text-center text-ink-muted">
          <HardHat className="h-7 w-7" />
          <p className="text-sm">進行中の現場がありません</p>
        </div>
      )}

      <div className="space-y-1 px-1 text-xs text-ink-faint">
        <p>「配員を編集」でその日に現場へ行く人を設定。pillタップで外せます。現場入りした人が、その日の日報対象になります。</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />未打刻</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />下書き</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />提出済</span>
        </p>
      </div>

      {editSite && (
        <VisitSheet
          key={editSite.id}
          site={editSite}
          allUsers={allUsers}
          visitedSet={visited[editSite.id] ?? new Set()}
          pendingKeys={pendingKeys}
          onToggle={toggle}
          onClose={() => setEditSiteId(null)}
        />
      )}
    </div>
  );
}

// 配員編集ボトムシート（当日制）。allUsers（管理者・スタッフ両方）を一覧表示し、
// タップで当日の現場入り(SiteVisit)をトグル。訪問集合は親の楽観 state を共有し、
// シートの変更が即座に pill と「この日の現場入り 合計」に反映される。
function VisitSheet({
  site,
  allUsers,
  visitedSet,
  pendingKeys,
  onToggle,
  onClose,
}: {
  site: SiteRow;
  allUsers: DispatchUser[];
  visitedSet: Set<string>;
  pendingKeys: Set<string>;
  onToggle: (siteId: string, userId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-app rounded-t-3xl bg-surface p-5 pb-8 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">配員を編集</h2>
            <p className="truncate text-xs text-ink-muted">{site.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {allUsers.map((u) => {
            const on = visitedSet.has(u.id);
            const busy = pendingKeys.has(`${site.id}_${u.id}`);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onToggle(site.id, u.id)}
                disabled={busy}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99] disabled:opacity-60",
                  on
                    ? "border-brand-600 bg-brand-50 dark:bg-brand-950/30"
                    : "border-line-strong bg-surface",
                )}
              >
                <Avatar name={u.name} color={u.avatarColor} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{u.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {ROLE_LABEL[u.role as Role] ?? u.role}
                  </span>
                </span>
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
                ) : (
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                      on
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-line-strong text-transparent",
                    )}
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-3 px-1 text-xs text-ink-faint">
          タップでその日の現場入りをON/OFF。管理者・スタッフの両方を配員できます。
        </p>
      </div>
    </div>
  );
}
