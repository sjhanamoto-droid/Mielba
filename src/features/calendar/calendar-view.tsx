"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  MapPin,
  X,
  ArrowRight,
  CalendarClock,
  Pencil,
  HardHat,
  Loader2,
  Building2,
  User,
  EyeOff,
} from "lucide-react";
import { EventForm } from "./event-form";
import type { PickerSite } from "./site-picker";
import { deleteEvent, deleteVisitGroup } from "./actions";
import { jstDateKey, dateFromKey, addDaysKey } from "@/lib/date";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LinkButton, Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/misc";
import {
  EVENT_SOURCE_LABEL,
  EVENT_SOURCE_COLOR,
  EVENT_CATEGORY_LABEL,
  EVENT_CATEGORY_COLOR,
  type EventSource,
  type EventCategory,
} from "@/lib/constants";
import { cn, fmtDateWithDay } from "@/lib/utils";
import { dayTone, holidayName } from "@/lib/holidays";

export type CalendarViewMode = "day" | "week" | "month";

type PersonRef = { id: string; name: string; avatarColor: string; avatarImage?: string | null };

export type CalendarEventData = {
  id: string;
  title: string;
  date: string; // ISO 文字列
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  note: string | null; // 内容
  source: string;
  category: string | null;
  isPrivate: boolean; // 非公開（最高管理者の個人予定）。取得時点で本人にしか渡らない
  location: string | null;
  site: { id: string; name: string; customer?: { name: string } | null } | null;
  owner: PersonRef | null; // この予定で現場に行く人（担当）
  createdBy: PersonRef | null; // 入力した人
  participants: PersonRef[]; // 参加者（現場に行く人・複数）
};

// 現場入り（配員・自己申告）。現場×日でまとめた「誰が行くか」を読み取り専用チップで表示する。
export type CalendarVisitData = {
  id: string;
  date: string; // ISO 文字列
  site: { id: string; name: string };
  visitors: PersonRef[]; // その現場に入る人（配員・自己申告）
};

type SiteOption = PickerSite;
type UserOption = { id: string; name: string; avatarColor: string; avatarImage?: string | null };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const SOURCE_BADGE_TONE: Record<EventSource, "brand" | "accent" | "active" | "info" | "neutral"> = {
  MANUAL: "brand",
  DELIVERY: "accent",
  SUPPLY: "info",
  PROCESS: "active",
  MILESTONE: "info",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// 一覧の緑ラベル：現場の予定は顧客名（顧客が無ければ現場名）、現場なしは「個人予定」。
// 件名が現場名になったため、同じ現場名を2行並べず「誰の仕事か」を出す。
function ownerLabel(ev: CalendarEventData): string {
  if (!ev.site) return "個人予定";
  return ev.site.customer?.name?.trim() || ev.site.name;
}

// "YYYY-MM-DD"（暦日キー。クライアントは日本のユーザー前提だが、
// Intl ベースの jstDateKey で「今日」判定をサーバー側と統一する）
function dayKey(d: Date): string {
  return jstDateKey(d);
}

// 各日の並び：現場に紐づく予定（現場入りに続く）を上、現場なし（個人・その他・休み）を下。
// 同グループ内は従来どおり 終日 → 時刻順。
function sortEvents(list: CalendarEventData[]): CalendarEventData[] {
  return list.slice().sort((a, b) => {
    const sa = a.site ? 0 : 1;
    const sb = b.site ? 0 : 1;
    if (sa !== sb) return sa - sb;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const ta = a.startTime ?? "";
    const tb = b.startTime ?? "";
    return ta.localeCompare(tb);
  });
}

// チップの識別色：休みなどカテゴリー色があれば優先し、なければ出所色を使う。
function eventColor(ev: CalendarEventData): string {
  const cat = ev.category as EventCategory | null;
  if (cat && EVENT_CATEGORY_COLOR[cat]) return EVENT_CATEGORY_COLOR[cat]!;
  return EVENT_SOURCE_COLOR[ev.source as EventSource] ?? EVENT_SOURCE_COLOR.MANUAL;
}

// カテゴリーバッジの色調（休みはスレート、それ以外は無地）。
function categoryTone(category: string | null): "neutral" | "past" {
  return category === "HOLIDAY" ? "past" : "neutral";
}

// ─────────────────── 現場入り（読み取り専用チップ） ───────────────────
// EVENT 色とは別の識別：ブランド色の破線ボーダー＋ヘルメットアイコン。
// 配員・自己申告でその現場に入る人を、末尾にアバターで添える。
// 現場入りチップ/行のタップで詳細（管理者は削除）を開く。各ビューへ props を通さず context で渡す。
const VisitSelectContext = createContext<((v: CalendarVisitData) => void) | null>(null);

function VisitChip({ visit, compact = false }: { visit: CalendarVisitData; compact?: boolean }) {
  const names = visit.visitors.map((p) => p.name).join("・");
  const onSelectVisit = useContext(VisitSelectContext);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelectVisit?.(visit);
      }}
      title={names ? `現場入り：${visit.site.name}（${names}）` : `現場入り：${visit.site.name}`}
      className={cn(
        "flex w-full items-center gap-1 rounded-md border border-dashed border-brand-400 bg-brand-50/60 text-left text-brand-700 md:hover:bg-brand-50",
        compact ? "items-start px-1 py-0.5 text-[10px] font-semibold leading-snug" : "px-2 py-1 text-[11px] font-semibold",
      )}
    >
      <HardHat className={compact ? "h-3 w-3 shrink-0 self-start mt-px" : "h-3.5 w-3.5 shrink-0"} aria-hidden />
      {compact ? (
        // 月表示：現場名と行く人を省略せず折り返して全部出す
        <span className="min-w-0 break-words">
          {visit.site.name}
          {names && <span className="block text-[10px] font-medium text-brand-700/80">{names}</span>}
        </span>
      ) : (
        <span className="min-w-0 truncate">{visit.site.name}</span>
      )}
      {!compact && visit.visitors.length > 0 && (
        <span className="ml-auto flex shrink-0 items-center -space-x-1.5">
          {visit.visitors.slice(0, 3).map((p) => (
            <Avatar
              key={p.id}
              name={p.name}
              color={p.avatarColor}
              image={p.avatarImage}
              size="sm"
              className="h-4 w-4 text-[8px] ring-1 ring-white"
            />
          ))}
          {visit.visitors.length > 3 && (
            <span className="pl-1 text-[9px] font-bold text-brand-700">
              +{visit.visitors.length - 3}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

// "09:00" → "9:00"（行の左カラム用）
function shortTime(t: string): string {
  return t.replace(/^0(\d)/, "$1");
}

// 日付の文字色：祝日・日曜＝赤、土曜＝青（祝日は土曜でも赤）。平日は fallback
const TONE_TEXT = {
  holiday: "text-red-500",
  sunday: "text-red-500",
  saturday: "text-blue-500",
} as const;
function toneText(dateKey: string, dow: number, fallback: string): string {
  const tone = dayTone(dateKey, dow);
  return tone ? TONE_TEXT[tone] : fallback;
}

// 祝日名のピル（赤）
function HolidayPill({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300",
        className,
      )}
    >
      {name}
    </span>
  );
}

// 日付見出し（「10月2日 金曜日」＋今日なら「今日」ピル＋祝日なら祝日名）。月ビューの選択日・日ビューで使う。
function DayHeading({ date, isToday, className }: { date: Date; isToday: boolean; className?: string }) {
  const dateKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const holiday = holidayName(dateKey);
  return (
    <div className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("text-xl font-bold tnum", toneText(dateKey, date.getDay(), "text-ink"))}>
        {date.getMonth() + 1}月{date.getDate()}日
      </span>
      <span className={cn("text-sm font-semibold", toneText(dateKey, date.getDay(), "text-ink-muted"))}>
        {WEEKDAYS[date.getDay()]}曜日
      </span>
      {holiday && <HolidayPill name={holiday} className="self-center" />}
      {isToday && (
        <span className="self-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
          今日
        </span>
      )}
    </div>
  );
}

// 「予定を追加」ボタン（見出しの右に置く。押しやすい高さ 44px）
function AddEventButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-bold text-white shadow-card active:scale-95 md:hover:bg-brand-700"
    >
      <Plus className="h-4 w-4" />
      予定を追加
    </button>
  );
}

// リスト表示用（選択日の予定リスト・日ビュー）。現場に入る人をアバターで表示する。
function VisitRow({ visit }: { visit: CalendarVisitData }) {
  const onSelectVisit = useContext(VisitSelectContext);
  return (
    <button
      type="button"
      onClick={() => onSelectVisit?.(visit)}
      className="flex w-full items-center gap-4 px-4 py-3.5 text-left active:bg-surface-sunken md:hover:bg-surface-subtle"
    >
      <div className="flex w-12 shrink-0 justify-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <HardHat className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <span className="h-10 w-px shrink-0 bg-line" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold text-ink">{visit.site.name}</p>
        <p className="mt-0.5 text-sm text-ink-muted">現場入り（出面）・{visit.visitors.length}名</p>
        {visit.visitors.length > 0 && (
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 items-center -space-x-1.5">
              {visit.visitors.slice(0, 8).map((p) => (
                <Avatar
                  key={p.id}
                  name={p.name}
                  color={p.avatarColor}
                  image={p.avatarImage}
                  size="sm"
                  className="h-5 w-5 text-[9px] ring-1 ring-white"
                />
              ))}
            </span>
            <span className="min-w-0 truncate text-sm text-ink-muted">
              {visit.visitors.map((p) => p.name).join("・")}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// 1件の予定サマリー（クリックで詳細モーダルを開く）。
// ホームの「これからの予定」と同じ並び：左に時刻、縦線（出所色）、右に件名と誰の仕事か。
function EventRow({
  ev,
  onSelect,
}: {
  ev: CalendarEventData;
  onSelect: (ev: CalendarEventData) => void;
}) {
  const src = ev.source as EventSource;
  const color = eventColor(ev);
  const people = ev.participants.length > 0 ? ev.participants : ev.owner ? [ev.owner] : [];
  const timed = !ev.allDay && !!ev.startTime;
  return (
    <button
      type="button"
      onClick={() => onSelect(ev)}
      className="flex w-full items-center gap-4 px-4 py-3.5 text-left tap-row transition-colors hover:bg-surface-subtle"
    >
      <div className="w-12 shrink-0 text-center">
        {timed ? (
          <>
            <p className="text-base font-bold tnum leading-tight text-ink">{shortTime(ev.startTime!)}</p>
            {ev.endTime && (
              <p className="whitespace-nowrap text-xs font-semibold tnum text-ink-muted">–{shortTime(ev.endTime)}</p>
            )}
          </>
        ) : (
          <p className="text-sm font-bold text-ink">終日</p>
        )}
      </div>
      <span className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold leading-snug text-ink">{ev.title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-muted">
          {ev.site ? (
            <MapPin className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <User className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate">{ownerLabel(ev)}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={SOURCE_BADGE_TONE[src] ?? "neutral"}>
            {EVENT_SOURCE_LABEL[src] ?? ev.source}
          </Badge>
          {ev.category && (
            <Badge tone={categoryTone(ev.category)}>
              {EVENT_CATEGORY_LABEL[ev.category as EventCategory] ?? ev.category}
            </Badge>
          )}
          {ev.isPrivate && (
            <span className="flex items-center gap-1 text-xs font-bold text-ink-muted">
              <EyeOff className="h-3 w-3" />
              自分だけ
            </span>
          )}
          {people.length > 0 && (
            <span className="flex items-center -space-x-1.5">
              {people.slice(0, 6).map((p) => (
                <Avatar key={p.id} name={p.name} color={p.avatarColor} image={p.avatarImage} size="sm" className="h-5 w-5 text-[9px] ring-1 ring-white" />
              ))}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
    </button>
  );
}

// ─────────────────── 予定の詳細モーダル（全ビュー共通） ───────────────────
function EventDetailModal({
  event,
  onClose,
  onEdit,
  onDelete,
  canDelete,
}: {
  event: CalendarEventData | null;
  onClose: () => void;
  onEdit: (ev: CalendarEventData) => void;
  onDelete: (ev: CalendarEventData) => void;
  canDelete: boolean; // 管理者：日報由来の予定も削除できる
}) {
  if (!event) return null;
  const ev = event;
  const src = ev.source as EventSource;
  const color = eventColor(ev);
  const people = ev.participants.length > 0 ? ev.participants : ev.owner ? [ev.owner] : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-6">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-float md:max-w-md md:rounded-3xl md:px-6 md:pb-6 md:pt-5">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong md:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">予定の詳細</h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft active:bg-surface-sunken"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* バッジ */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={SOURCE_BADGE_TONE[src] ?? "neutral"}>
            {EVENT_SOURCE_LABEL[src] ?? ev.source}
          </Badge>
          {ev.category && (
            <Badge tone={categoryTone(ev.category)}>
              {EVENT_CATEGORY_LABEL[ev.category as EventCategory] ?? ev.category}
            </Badge>
          )}
        </div>

        {/* 件名 */}
        <h3 className="mt-2 border-l-[3px] pl-2.5 text-xl font-bold leading-snug text-ink" style={{ borderColor: color }}>
          {ev.title}
        </h3>

        {/* 詳細 */}
        <dl className="mt-3 space-y-2.5 text-[15px]">
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            <dd className="font-medium text-ink">
              {fmtDateWithDay(new Date(ev.date))}
              {!ev.allDay && ev.startTime ? ` ・ ${ev.startTime}${ev.endTime ? `〜${ev.endTime}` : ""}` : " ・ 終日"}
            </dd>
          </div>
          {ev.site && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <dd className="font-semibold text-brand-600">{ev.site.name}</dd>
            </div>
          )}
          <div className="flex items-start gap-2">
            {ev.site ? (
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            ) : (
              <User className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            )}
            <dd className="font-semibold text-brand-600">{ownerLabel(ev)}</dd>
          </div>
          {ev.isPrivate && (
            <div className="flex items-start gap-2 rounded-xl bg-surface-sunken px-3 py-2">
              <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <dd className="text-xs font-semibold text-ink-soft">
                自分だけに表示（他の人のカレンダーには出ません）
              </dd>
            </div>
          )}
          {ev.location && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
              <dd className="text-ink-soft">{ev.location}</dd>
            </div>
          )}
          {ev.note && (
            <div className="rounded-xl bg-surface-subtle p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{ev.note}</p>
            </div>
          )}
          {people.length > 0 && (
            <div>
              <dt className="mb-1 text-xs font-semibold text-ink-muted">参加者（現場に行く人）</dt>
              <dd className="flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-surface-sunken py-1 pl-1 pr-3">
                    <Avatar name={p.name} color={p.avatarColor} image={p.avatarImage} size="sm" />
                    <span className="text-sm font-semibold text-ink">{p.name}</span>
                  </span>
                ))}
              </dd>
            </div>
          )}
          {ev.createdBy && (
            <p className="text-xs text-ink-faint">入力: {ev.createdBy.name}</p>
          )}
        </dl>

        {/* アクション */}
        <div className="mt-5 space-y-2">
          {ev.site && (
            <LinkButton href={`/sites/${ev.site.id}`} size="lg" className="w-full">
              現場詳細を見る
              <ArrowRight className="h-5 w-5" />
            </LinkButton>
          )}
          {(ev.source === "MANUAL" || canDelete) && (
            <div className="flex gap-2">
              {ev.source === "MANUAL" && (
                <Button variant="outline" className="flex-1" onClick={() => onEdit(ev)}>
                  <Pencil className="h-4 w-4" />
                  編集
                </Button>
              )}
              <Button
                variant="ghost"
                className={cn("text-status-danger hover:bg-red-50", ev.source !== "MANUAL" && "flex-1")}
                onClick={() => onDelete(ev)}
              >
                <Trash2 className="h-4 w-4" />
                削除
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 現場入り（配員）の詳細。管理者には削除ボタンを出す（onDelete があるときだけ）。
function VisitDetailModal({
  visit,
  onClose,
  onDelete,
}: {
  visit: CalendarVisitData | null;
  onClose: () => void;
  onDelete?: (v: CalendarVisitData) => void;
}) {
  if (!visit) return null;
  const v = visit;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-6">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-float md:max-w-md md:rounded-3xl md:px-6 md:pb-6 md:pt-5">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong md:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">現場入り（配員）</h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft active:bg-surface-sunken"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h3 className="flex items-center gap-2 text-xl font-bold leading-snug text-ink">
          <HardHat className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          {v.site.name}
        </h3>

        <dl className="mt-3 space-y-2.5 text-[15px]">
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            <dd className="font-medium text-ink">{fmtDateWithDay(new Date(v.date))}</dd>
          </div>
          {v.visitors.length > 0 && (
            <div>
              <dt className="mb-1 text-xs font-semibold text-ink-muted">現場に入る人</dt>
              <dd className="flex flex-wrap gap-1.5">
                {v.visitors.map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-surface-sunken py-1 pl-1 pr-3">
                    <Avatar name={p.name} color={p.avatarColor} image={p.avatarImage} size="sm" />
                    <span className="text-sm font-semibold text-ink">{p.name}</span>
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5 space-y-2">
          <LinkButton href={`/sites/${v.site.id}`} size="lg" className="w-full">
            現場詳細を見る
            <ArrowRight className="h-5 w-5" />
          </LinkButton>
          {onDelete && (
            <Button
              variant="ghost"
              className="w-full text-status-danger hover:bg-red-50"
              onClick={() => onDelete(v)}
            >
              <Trash2 className="h-4 w-4" />
              削除
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// 月セル内のイベントチップ（md 以上のデスクトップ/タブレットで表示）。
// 出所色のドット＋タイトル（＋時刻）をコンパクトに1行で。
function MonthEventChip({
  ev,
  onSelect,
}: {
  ev: CalendarEventData;
  onSelect: (ev: CalendarEventData) => void;
}) {
  const color = eventColor(ev);
  const people = ev.participants.length > 0 ? ev.participants : ev.owner ? [ev.owner] : [];
  // 月表示でも省略しない：時刻・件名（折り返し）・行く人（全員の名前）をすべて出す
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(ev);
      }}
      className="flex w-full flex-col gap-0.5 rounded-md border-l-2 bg-surface-subtle px-1.5 py-1 text-left text-[11px] font-medium leading-snug text-ink-soft hover:bg-surface-sunken"
      style={{ borderColor: color }}
    >
      <span className="flex flex-wrap items-baseline gap-x-1">
        {ev.isPrivate && <EyeOff className="h-2.5 w-2.5 shrink-0 self-center text-ink-muted" aria-hidden />}
        {!ev.allDay && ev.startTime && (
          <span className="shrink-0 font-bold tnum text-ink-muted">{ev.startTime}</span>
        )}
        <span className="min-w-0 break-words font-semibold text-ink">{ev.title}</span>
      </span>
      {people.length > 0 && (
        <span className="break-words text-[10px] leading-snug text-ink-muted">
          {people.map((p) => p.name).join("・")}
        </span>
      )}
    </button>
  );
}

// ナビ用の丸ボタン（前/次）。router.push + useTransition の pending 中は無効化。
function NavArrow({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft active:bg-surface-sunken disabled:opacity-50 md:hover:bg-surface-sunken"
    >
      {children}
    </button>
  );
}

export function CalendarView({
  events,
  visits = [],
  view,
  year,
  month, // 1-12
  baseDay, // "YYYY-MM-DD"（週/日ビューの基準日）
  sites,
  users,
  currentUserId,
  canSetPrivate = false,
  canDelete = false,
}: {
  events: CalendarEventData[];
  visits?: CalendarVisitData[];
  view: CalendarViewMode;
  year: number;
  month: number;
  baseDay: string;
  sites: SiteOption[];
  users: UserOption[];
  currentUserId: string;
  canSetPrivate?: boolean; // 最高管理者のみ true（個人予定を「他の人に表示しない」にできる）
  canDelete?: boolean; // 管理者のみ true（日報由来の予定・現場入りも削除できる）
}) {
  const todayKey = jstDateKey();
  const router = useRouter();
  const toast = useToast();

  // 月/週/日送り・ビュー切替は router.push + useTransition。
  // 低速回線で「押したのに変わらない」無反応に見えないよう、pending 中は薄化＋スピナー。
  const [navPending, startNav] = useTransition();
  function navigate(href: string) {
    startNav(() => {
      router.push(href, { scroll: false });
    });
  }

  // 日付キー → イベント配列
  const byDay = new Map<string, CalendarEventData[]>();
  for (const ev of events) {
    const key = dayKey(new Date(ev.date));
    const arr = byDay.get(key);
    if (arr) arr.push(ev);
    else byDay.set(key, [ev]);
  }
  // 日付キー → 自分の現場入り
  const visitsByDay = new Map<string, CalendarVisitData[]>();
  for (const v of visits) {
    const key = dayKey(new Date(v.date));
    const arr = visitsByDay.get(key);
    if (arr) arr.push(v);
    else visitsByDay.set(key, [v]);
  }

  // 月ビュー：選択中の日付（既定は今日が当月なら今日、なければ1日）
  const todayDate = dateFromKey(todayKey);
  const todayInMonth =
    todayDate.getFullYear() === year && todayDate.getMonth() + 1 === month;
  const [selectedDay, setSelectedDay] = useState<number>(
    todayInMonth ? todayDate.getDate() : 1,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEventData | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventData | null>(null);
  // 削除は確認ダイアログを挟む（確認なし即削除の修正）
  const [deleteTarget, setDeleteTarget] = useState<CalendarEventData | null>(null);

  const [selectedVisit, setSelectedVisit] = useState<CalendarVisitData | null>(null);
  const [visitDeleteTarget, setVisitDeleteTarget] = useState<CalendarVisitData | null>(null);

  async function handleVisitDeleteConfirm() {
    if (!visitDeleteTarget) return;
    const v = visitDeleteTarget;
    const r = await deleteVisitGroup(v.site.id, v.date, v.visitors.map((p) => p.id));
    if (r?.error) {
      toast(r.error, { type: "error" });
    } else {
      toast("現場入りを削除しました");
      setSelectedVisit(null);
    }
    setVisitDeleteTarget(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const r = await deleteEvent(deleteTarget.id);
    if (r?.error) {
      toast(r.error, { type: "error" });
    } else {
      toast("予定を削除しました");
      setSelectedEvent(null);
    }
    setDeleteTarget(null);
  }

  function openForm(dateKey: string) {
    setEditEvent(null);
    setFormDate(dateKey);
    setFormOpen(true);
  }

  function handleEdit(ev: CalendarEventData) {
    setSelectedEvent(null);
    setEditEvent(ev);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditEvent(null);
  }

  // ── ビュー切替のリンク先 ──
  // 「今見ている日付」を切替後も保持する。月ビューでは選択中の日、
  // 週/日ビューでは基準日 baseDay を基準にする。
  // これで例：月ビューで8/5を選択→「日」を押すと8/5の日ビューが開く。
  const activeDayKey =
    view === "month" ? `${year}-${pad(month)}-${pad(selectedDay)}` : baseDay;
  const activeYm = activeDayKey.slice(0, 7); // "YYYY-MM"
  const monthHref = `/calendar?view=month&ym=${activeYm}`;
  const weekHref = `/calendar?view=week&d=${activeDayKey}`;
  const dayHref = `/calendar?view=day&d=${activeDayKey}`;

  return (
    <VisitSelectContext.Provider value={setSelectedVisit}>
    <div className="space-y-4">
      {/* ビュー切替（デスクトップでは間延びしないよう幅を抑える） */}
      <div className="relative grid grid-cols-3 gap-1 rounded-full bg-surface-sunken p-1 md:mx-auto md:w-80">
        {(
          [
            ["day", "日", dayHref],
            ["week", "週", weekHref],
            ["month", "月", monthHref],
          ] as const
        ).map(([mode, label, href]) => (
          <button
            key={mode}
            type="button"
            onClick={() => navigate(href)}
            disabled={navPending}
            className={cn(
              "flex h-9 items-center justify-center rounded-full text-sm font-bold transition-colors disabled:opacity-60",
              view === mode
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-muted active:bg-surface-subtle md:hover:text-ink-soft",
            )}
          >
            {label}
          </button>
        ))}
        {navPending && (
          <span className="absolute -right-7 top-1/2 -translate-y-1/2 md:-right-8">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-label="読み込み中" />
          </span>
        )}
      </div>

      {/* pending 中はカレンダー全体を薄化して「反応している」ことを示す */}
      <div className={cn(navPending && "pointer-events-none opacity-60 transition-opacity")}>
        <div className="space-y-4">
          {view === "month" && (
            <MonthView
              year={year}
              month={month}
              byDay={byDay}
              visitsByDay={visitsByDay}
              todayKey={todayKey}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              onAdd={openForm}
              onSelect={setSelectedEvent}
              navigate={navigate}
              navPending={navPending}
            />
          )}

          {view === "week" && (
            <WeekView
              baseDay={baseDay}
              byDay={byDay}
              visitsByDay={visitsByDay}
              todayKey={todayKey}
              onAdd={openForm}
              onSelect={setSelectedEvent}
              navigate={navigate}
              navPending={navPending}
            />
          )}

          {view === "day" && (
            <DayView
              baseDay={baseDay}
              byDay={byDay}
              visitsByDay={visitsByDay}
              todayKey={todayKey}
              onAdd={openForm}
              onSelect={setSelectedEvent}
              navigate={navigate}
              navPending={navPending}
            />
          )}
        </div>
      </div>

      {/* 凡例（全ビュー共通） */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        {(Object.keys(EVENT_SOURCE_LABEL) as EventSource[]).map((src) => (
          <span key={src} className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: EVENT_SOURCE_COLOR[src] }}
            />
            {src === "MANUAL" ? "手動予定" : `日報：${EVENT_SOURCE_LABEL[src]}`}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <HardHat className="h-3 w-3 text-brand-600" aria-hidden />
          現場入り（配員）
        </span>
      </div>

      {formOpen && (
        <EventForm
          onClose={closeForm}
          sites={sites}
          users={users}
          defaultDate={formDate ?? baseDay}
          event={editEvent}
          currentUserId={currentUserId}
          canSetPrivate={canSetPrivate}
        />
      )}

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={handleEdit}
        onDelete={(ev) => setDeleteTarget(ev)}
        canDelete={canDelete}
      />

      <VisitDetailModal
        visit={selectedVisit}
        onClose={() => setSelectedVisit(null)}
        onDelete={canDelete ? (v) => setVisitDeleteTarget(v) : undefined}
      />

      <ConfirmDialog
        open={visitDeleteTarget !== null}
        onClose={() => setVisitDeleteTarget(null)}
        onConfirm={handleVisitDeleteConfirm}
        title="現場入りを削除しますか？"
        description={
          visitDeleteTarget ? (
            <>
              「{visitDeleteTarget.site.name}」の現場入り（
              {visitDeleteTarget.visitors.map((p) => p.name).join("・") || "0名"}）を削除します。日報・予定は消えません。
            </>
          ) : undefined
        }
        confirmLabel="削除する"
        danger
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="予定を削除しますか？"
        description={
          deleteTarget ? (
            <>
              「{deleteTarget.title}」を削除します。この操作は取り消せません。
            </>
          ) : undefined
        }
        confirmLabel="削除する"
        danger
      />
    </div>
    </VisitSelectContext.Provider>
  );
}

// ───────────────────────── 月ビュー ─────────────────────────
function MonthView({
  year,
  month,
  byDay,
  visitsByDay,
  todayKey,
  selectedDay,
  setSelectedDay,
  onAdd,
  onSelect,
  navigate,
  navPending,
}: {
  year: number;
  month: number;
  byDay: Map<string, CalendarEventData[]>;
  visitsByDay: Map<string, CalendarVisitData[]>;
  todayKey: string;
  selectedDay: number;
  setSelectedDay: (d: number) => void;
  onAdd: (dateKey: string) => void;
  onSelect: (ev: CalendarEventData) => void;
  navigate: (href: string) => void;
  navPending: boolean;
}) {
  // 当月のセル配列を生成
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstDay.getDay(); // 0=日

  const cells: (number | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // 前月／次月
  const prevYm = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
  const nextYm = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;

  const selectedKey = `${year}-${pad(month)}-${pad(selectedDay)}`;
  const selectedDate = dateFromKey(selectedKey);
  const selectedEvents = sortEvents(byDay.get(selectedKey) ?? []);
  const selectedVisits = visitsByDay.get(selectedKey) ?? [];
  // 現場に紐づく予定（現場入りに続けて上）／現場なし（その他・休み・個人）を下に分ける
  const selectedSiteEvents = selectedEvents.filter((e) => e.site);
  const selectedPersonalEvents = selectedEvents.filter((e) => !e.site);
  // 上段（現場入り＋現場予定）と下段（現場なし）が両方あるときだけ区切り見出しを出す
  const showPersonalDivider =
    selectedPersonalEvents.length > 0 &&
    (selectedSiteEvents.length > 0 || selectedVisits.length > 0);

  return (
    <>
      {/* 月ナビ */}
      <div className="flex items-center justify-between">
        <NavArrow
          onClick={() => navigate(`/calendar?view=month&ym=${prevYm}`)}
          label="前の月"
          disabled={navPending}
        >
          <ChevronLeft className="h-6 w-6" />
        </NavArrow>
        <p className="text-xl font-bold text-ink tnum">
          {year}年 {month}月
        </p>
        <NavArrow
          onClick={() => navigate(`/calendar?view=month&ym=${nextYm}`)}
          label="次の月"
          disabled={navPending}
        >
          <ChevronRight className="h-6 w-6" />
        </NavArrow>
      </div>

      {/* デスクトップは2カラム（左：大きな月グリッド / 右：選択日の予定）。スマホは縦積み。 */}
      <div className="space-y-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        {/* 月グリッド */}
        <div className="card overflow-hidden p-2 md:p-3 lg:col-span-2">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={cn(
                  "pb-1.5 text-center text-[11px] font-bold md:text-sm",
                  i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-ink-muted",
                )}
              >
                {w}
              </div>
            ))}
            {cells.map((day, idx) => {
              if (day === null) {
                return (
                  <div
                    key={`b-${idx}`}
                    className="aspect-square md:aspect-auto md:min-h-[88px] lg:min-h-[120px] xl:min-h-[132px]"
                  />
                );
              }
              const key = `${year}-${pad(month)}-${pad(day)}`;
              const dayEvents = sortEvents(byDay.get(key) ?? []);
              const dayVisits = visitsByDay.get(key) ?? [];
              const isSelected = day === selectedDay;
              const isToday = key === todayKey;
              const dow = idx % 7;
              const holiday = holidayName(key);
              return (
                <div
                  key={key}
                  onClick={() => setSelectedDay(day)}
                  title={holiday ?? undefined}
                  className={cn(
                    "flex aspect-square cursor-pointer flex-col items-center justify-start rounded-xl p-1 transition-colors active:bg-surface-sunken md:aspect-auto md:min-h-[88px] md:items-stretch md:gap-0.5 md:p-1.5 md:hover:bg-surface-sunken lg:min-h-[120px] xl:min-h-[132px]",
                    isSelected && "bg-brand-50 ring-2 ring-brand-300",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold tnum md:h-7 md:w-7 md:self-start md:text-sm",
                      isToday
                        ? "bg-brand-600 text-white"
                        : toneText(key, dow, "text-ink"),
                    )}
                  >
                    {day}
                  </span>
                  {/* 祝日名（md 以上はセル内に。スマホは日付をタップすると下の見出しに出る） */}
                  {holiday && (
                    <span className="hidden truncate px-0.5 text-[11px] font-bold leading-tight text-red-500 md:block">
                      {holiday}
                    </span>
                  )}
                  {/* スマホ：現場入りはヘルメット、予定は出所色のドット（最大4個） */}
                  <span className="mt-0.5 flex min-h-[8px] flex-wrap items-center justify-center gap-0.5 md:hidden">
                    {dayVisits.length > 0 && (
                      <HardHat className="h-2.5 w-2.5 text-brand-600" aria-label="現場入り" />
                    )}
                    {dayEvents.slice(0, 4).map((ev) => (
                      <span
                        key={ev.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: eventColor(ev) }}
                      />
                    ))}
                  </span>
                  {/* md 以上：現場入りチップ＋（ドット＋タイトル）で複数件表示 */}
                  <span className="hidden min-w-0 flex-col gap-0.5 md:flex">
                    {dayVisits.map((v) => (
                      <VisitChip key={v.id} visit={v} compact />
                    ))}
                    {dayEvents.map((ev) => (
                      <MonthEventChip key={ev.id} ev={ev} onSelect={onSelect} />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 選択日の予定リスト（デスクトップは右レール）。月表示が縦に長くてもスクロールに追従し、
            件数が多いときはレール内でスクロールする（上端はページ見出しの下） */}
        <div className="space-y-2.5 lg:sticky lg:top-24 lg:col-span-1 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pb-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="min-w-0">
              <DayHeading date={selectedDate} isToday={selectedKey === todayKey} />
            </h2>
            <AddEventButton onClick={() => onAdd(selectedKey)} />
          </div>

          {selectedEvents.length === 0 && selectedVisits.length === 0 ? (
            <EmptyState title="この日の予定はありません" description="「＋予定を追加」から登録できます" />
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {selectedVisits.map((v) => (
                <VisitRow key={v.id} visit={v} />
              ))}
              {selectedSiteEvents.map((ev) => (
                <EventRow key={ev.id} ev={ev} onSelect={onSelect} />
              ))}
              {showPersonalDivider && (
                <p className="bg-surface-subtle px-4 py-2 text-xs font-bold text-ink-muted">
                  その他・休み
                </p>
              )}
              {selectedPersonalEvents.map((ev) => (
                <EventRow key={ev.id} ev={ev} onSelect={onSelect} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ───────────────────────── 週ビュー ─────────────────────────
// 週ビューの1件（コンパクト：時刻・件名・参加者アバター）
function WeekEventChip({
  ev,
  onSelect,
}: {
  ev: CalendarEventData;
  onSelect: (ev: CalendarEventData) => void;
}) {
  const color = eventColor(ev);
  const people = ev.participants.length > 0 ? ev.participants : ev.owner ? [ev.owner] : [];
  return (
    <button
      type="button"
      onClick={() => onSelect(ev)}
      className="w-full rounded-lg border-l-[3px] px-2.5 py-2 text-left transition-[filter] hover:brightness-95 md:px-2 md:py-1.5"
      style={{ borderColor: color, backgroundColor: `${color}12` }}
    >
      <p className="flex items-center gap-1 text-xs font-bold tnum text-ink-muted md:text-[10px]">
        {ev.isPrivate && <EyeOff className="h-2.5 w-2.5 shrink-0" aria-hidden />}
        {!ev.allDay && ev.startTime ? `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}` : "終日"}
      </p>
      {/* 週表示でも省略しない：件名・誰の仕事か・行く人（全員の名前）を折り返して全部出す */}
      <p className="mt-0.5 break-words text-[15px] font-bold leading-tight text-ink md:text-[11px] md:font-semibold">{ev.title}</p>
      <p className="mt-0.5 break-words text-xs font-medium text-brand-600 md:text-[10px]">{ownerLabel(ev)}</p>
      {people.length > 0 && (
        <p className="mt-0.5 break-words text-xs leading-snug text-ink-muted md:text-[10px]">
          {people.map((p) => p.name).join("・")}
        </p>
      )}
    </button>
  );
}

function WeekView({
  baseDay,
  byDay,
  visitsByDay,
  todayKey,
  onAdd,
  onSelect,
  navigate,
  navPending,
}: {
  baseDay: string;
  byDay: Map<string, CalendarEventData[]>;
  visitsByDay: Map<string, CalendarVisitData[]>;
  todayKey: string;
  onAdd: (dateKey: string) => void;
  onSelect: (ev: CalendarEventData) => void;
  navigate: (href: string) => void;
  navPending: boolean;
}) {
  const base = dateFromKey(baseDay);
  // 週の起点（日曜）のキー
  const weekStartKey = addDaysKey(baseDay, -base.getDay());
  const dayKeys: string[] = [];
  for (let i = 0; i < 7; i++) dayKeys.push(addDaysKey(weekStartKey, i));
  const weekStart = dateFromKey(dayKeys[0]);
  const weekEnd = dateFromKey(dayKeys[6]);

  const prevKey = addDaysKey(weekStartKey, -7);
  const nextKey = addDaysKey(weekStartKey, 7);

  return (
    <>
      {/* 週ナビ */}
      <div className="flex items-center justify-between">
        <NavArrow
          onClick={() => navigate(`/calendar?view=week&d=${prevKey}`)}
          label="前の週"
          disabled={navPending}
        >
          <ChevronLeft className="h-6 w-6" />
        </NavArrow>
        <p className="text-lg font-bold text-ink tnum md:text-xl">
          {weekStart.getMonth() + 1}/{weekStart.getDate()} 〜 {weekEnd.getMonth() + 1}/{weekEnd.getDate()}
        </p>
        <NavArrow
          onClick={() => navigate(`/calendar?view=week&d=${nextKey}`)}
          label="次の週"
          disabled={navPending}
        >
          <ChevronRight className="h-6 w-6" />
        </NavArrow>
      </div>

      {/* スマホ：7日の縦リスト / md 以上：全幅の7カラム週ボード（等高） */}
      <div className="space-y-3 md:grid md:grid-cols-7 md:gap-2 md:space-y-0">
        {dayKeys.map((key) => {
          const d = dateFromKey(key);
          const list = sortEvents(byDay.get(key) ?? []);
          const dayVisits = visitsByDay.get(key) ?? [];
          const isToday = key === todayKey;
          const dow = d.getDay();
          const holiday = holidayName(key);
          return (
            <div key={key} className="card overflow-hidden md:flex md:min-h-[calc(100vh-320px)] md:flex-col">
              {/* 日ヘッダー */}
              <div
                className={cn(
                  "flex items-center justify-between border-b border-line py-1.5 pl-2 pr-1",
                  isToday && "bg-brand-50 dark:bg-brand-950/30",
                )}
              >
                <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-0">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tnum",
                      isToday
                        ? "bg-brand-600 text-white"
                        : toneText(key, dow, "text-ink"),
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <span className={cn("text-xs font-bold", toneText(key, dow, "text-ink-soft"))}>
                    <span className="md:hidden">{WEEKDAYS[dow]}曜</span>
                    <span className="hidden md:inline">{WEEKDAYS[dow]}</span>
                  </span>
                  {holiday && (
                    <span className="truncate text-[11px] font-bold text-red-500 md:max-w-full">
                      {holiday}
                    </span>
                  )}
                  {isToday && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white md:hidden">
                      今日
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(key)}
                  aria-label="この日に予定を追加"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-brand-600 active:bg-brand-100 md:h-7 md:w-7 md:hover:bg-brand-100"
                >
                  <Plus className="h-5 w-5 md:h-4 md:w-4" />
                </button>
              </div>
              {/* イベント */}
              <div className="space-y-1.5 p-1.5 md:flex-1">
                {/* 週表示も現場入りは省略せず、現場名と行く人を折り返して全部出す */}
                {dayVisits.map((v) => (
                  <VisitChip key={v.id} visit={v} compact />
                ))}
                {list.length === 0 && dayVisits.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-ink-faint md:text-[11px]">予定なし</p>
                ) : (
                  list.map((ev) => <WeekEventChip key={ev.id} ev={ev} onSelect={onSelect} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ───────────────────────── 日ビュー（全幅タイムライン） ─────────────────────────
function toMin(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

type Placed = { ev: CalendarEventData; s: number; e: number; col: number; cols: number };

// 時刻指定イベントに、重なりを考慮した列（col/cols）を割り当てる
function layoutTimed(events: CalendarEventData[]): Placed[] {
  const items: Placed[] = events
    .map((ev) => {
      const s = toMin(ev.startTime) ?? 8 * 60;
      const e = Math.max(s + 30, toMin(ev.endTime) ?? s + 60);
      return { ev, s, e, col: 0, cols: 1 };
    })
    .sort((a, b) => a.s - b.s || a.e - b.e);

  let i = 0;
  while (i < items.length) {
    let j = i + 1;
    let clusterEnd = items[i].e;
    const cluster: Placed[] = [items[i]];
    while (j < items.length && items[j].s < clusterEnd) {
      cluster.push(items[j]);
      clusterEnd = Math.max(clusterEnd, items[j].e);
      j++;
    }
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let k = 0; k < laneEnds.length; k++) {
        if (it.s >= laneEnds[k]) {
          it.col = k;
          laneEnds[k] = it.e;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.col = laneEnds.length;
        laneEnds.push(it.e);
      }
    }
    for (const it of cluster) it.cols = laneEnds.length;
    i = j;
  }
  return items;
}

function DayTimeline({
  allDay,
  timed,
  visits,
  onSelect,
}: {
  allDay: CalendarEventData[];
  timed: CalendarEventData[];
  visits: CalendarVisitData[];
  onSelect: (ev: CalendarEventData) => void;
}) {
  const HOUR_H = 60;
  const placed = layoutTimed(timed);
  let minH = 7;
  let maxH = 19;
  if (placed.length) {
    minH = Math.max(0, Math.min(minH, Math.floor(Math.min(...placed.map((p) => p.s)) / 60)));
    maxH = Math.min(24, Math.max(maxH, Math.ceil(Math.max(...placed.map((p) => p.e)) / 60)));
  }
  if (maxH <= minH) maxH = minH + 1;
  const hours: number[] = [];
  for (let h = minH; h <= maxH; h++) hours.push(h);
  const rangeStart = minH * 60;
  const totalH = (maxH - minH) * HOUR_H;

  return (
    <div className="card p-3">
      {/* 終日（現場入りも終日枠に表示） */}
      {(allDay.length > 0 || visits.length > 0) && (
        <div className="mb-3 flex gap-2 border-b border-line pb-3">
          <div className="w-14 shrink-0 pt-1 text-right text-[11px] font-bold text-ink-muted">終日</div>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {visits.map((v) => (
              <VisitChip key={v.id} visit={v} />
            ))}
            {allDay.map((ev) => {
              const color = eventColor(ev);
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSelect(ev)}
                  className="rounded-lg border-l-[3px] px-2 py-1 text-left text-xs font-semibold text-ink transition-[filter] hover:brightness-95"
                  style={{ borderColor: color, backgroundColor: `${color}14` }}
                >
                  {ev.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 時刻タイムライン */}
      <div className="flex">
        {/* 時刻ガター */}
        <div className="w-14 shrink-0">
          {hours.map((h) => (
            <div key={h} style={{ height: HOUR_H }} className="relative">
              <span className="absolute -top-2 right-2 text-[11px] font-bold tnum text-ink-faint">
                {h}:00
              </span>
            </div>
          ))}
        </div>
        {/* イベント領域 */}
        <div className="relative flex-1 border-l border-line" style={{ height: totalH }}>
          {hours.map((h, idx) => (
            <div
              key={h}
              style={{ top: idx * HOUR_H }}
              className="absolute inset-x-0 border-t border-line/60"
            />
          ))}
          {placed.map(({ ev, s, e, col, cols }) => {
            const top = ((s - rangeStart) / 60) * HOUR_H;
            const height = Math.max(26, ((e - s) / 60) * HOUR_H - 3);
            const widthPct = 100 / cols;
            const color = eventColor(ev);
            const people = ev.participants.length > 0 ? ev.participants : ev.owner ? [ev.owner] : [];
            return (
              <div
                key={ev.id}
                className="absolute px-0.5"
                style={{ top, height, left: `${col * widthPct}%`, width: `${widthPct}%` }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(ev)}
                  className="h-full w-full overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-[filter] hover:brightness-95"
                  style={{ borderColor: color, backgroundColor: `${color}16` }}
                >
                  <p className="text-[10px] font-bold tnum text-ink-muted">
                    {ev.startTime}
                    {ev.endTime ? `–${ev.endTime}` : ""}
                  </p>
                  <p className="truncate text-xs font-bold leading-tight text-ink">{ev.title}</p>
                  <p className="truncate text-[10px] font-medium text-brand-600">{ownerLabel(ev)}</p>
                  {people.length > 0 && height > 58 && (
                    <div className="mt-1 flex items-center -space-x-1.5">
                      {people.slice(0, 5).map((p) => (
                        <Avatar key={p.id} name={p.name} color={p.avatarColor} image={p.avatarImage} size="sm" className="h-4 w-4 text-[8px] ring-1 ring-white" />
                      ))}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({
  baseDay,
  byDay,
  visitsByDay,
  todayKey,
  onAdd,
  onSelect,
  navigate,
  navPending,
}: {
  baseDay: string;
  byDay: Map<string, CalendarEventData[]>;
  visitsByDay: Map<string, CalendarVisitData[]>;
  todayKey: string;
  onAdd: (dateKey: string) => void;
  onSelect: (ev: CalendarEventData) => void;
  navigate: (href: string) => void;
  navPending: boolean;
}) {
  const key = baseDay;
  const base = dateFromKey(key);
  const isToday = key === todayKey;

  const prevKey = addDaysKey(key, -1);
  const nextKey = addDaysKey(key, 1);

  const list = sortEvents(byDay.get(key) ?? []);
  const dayVisits = visitsByDay.get(key) ?? [];
  const allDayEvents = list.filter((e) => e.allDay);
  const timedEvents = list.filter((e) => !e.allDay);

  return (
    <div className="space-y-4">
      {/* 日ナビ */}
      <div className="flex items-center justify-between">
        <NavArrow
          onClick={() => navigate(`/calendar?view=day&d=${prevKey}`)}
          label="前の日"
          disabled={navPending}
        >
          <ChevronLeft className="h-6 w-6" />
        </NavArrow>
        <DayHeading date={base} isToday={isToday} className="justify-center" />
        <NavArrow
          onClick={() => navigate(`/calendar?view=day&d=${nextKey}`)}
          label="次の日"
          disabled={navPending}
        >
          <ChevronRight className="h-6 w-6" />
        </NavArrow>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-lg font-bold text-ink">この日の予定</h2>
        <AddEventButton onClick={() => onAdd(key)} />
      </div>

      {list.length === 0 && dayVisits.length === 0 ? (
        <EmptyState title="この日の予定はありません" description="「＋予定を追加」から登録できます" />
      ) : (
        <>
          {/* スマホ：リスト */}
          <div className="space-y-3 md:hidden">
            {dayVisits.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-base font-bold text-ink-soft">現場入り</h3>
                <div className="card divide-y divide-line overflow-hidden">
                  {dayVisits.map((v) => (
                    <VisitRow key={v.id} visit={v} />
                  ))}
                </div>
              </div>
            )}
            {allDayEvents.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-base font-bold text-ink-soft">終日</h3>
                <div className="card divide-y divide-line overflow-hidden">
                  {allDayEvents.map((ev) => (
                    <EventRow key={ev.id} ev={ev} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            )}
            {timedEvents.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-base font-bold text-ink-soft">時刻指定</h3>
                <div className="card divide-y divide-line overflow-hidden">
                  {timedEvents.map((ev) => (
                    <EventRow key={ev.id} ev={ev} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* PC/タブレット：全幅タイムライン */}
          <div className="hidden md:block">
            <DayTimeline allDay={allDayEvents} timed={timedEvents} visits={dayVisits} onSelect={onSelect} />
          </div>
        </>
      )}
    </div>
  );
}
