"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  MapPin,
  Clock,
  X,
  ArrowRight,
  CalendarClock,
  Pencil,
  HardHat,
  Loader2,
} from "lucide-react";
import { EventForm } from "./event-form";
import { deleteEvent } from "./actions";
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
  type EventSource,
  type EventCategory,
} from "@/lib/constants";
import { cn, fmtDateWithDay } from "@/lib/utils";

export type CalendarViewMode = "day" | "week" | "month";

type PersonRef = { id: string; name: string; avatarColor: string };

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
  location: string | null;
  site: { id: string; name: string } | null;
  owner: PersonRef | null; // この予定で現場に行く人（担当）
  createdBy: PersonRef | null; // 入力した人
  participants: PersonRef[]; // 参加者（現場に行く人・複数）
};

// 自分の現場入り（出面）。読み取り専用の予定チップとして表示する。
export type CalendarVisitData = {
  id: string;
  date: string; // ISO 文字列
  site: { id: string; name: string };
};

type SiteOption = { id: string; name: string; address?: string | null };
type UserOption = { id: string; name: string; avatarColor: string };

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

// "YYYY-MM-DD"（暦日キー。クライアントは日本のユーザー前提だが、
// Intl ベースの jstDateKey で「今日」判定をサーバー側と統一する）
function dayKey(d: Date): string {
  return jstDateKey(d);
}

// 時刻順（終日は先頭）にソート
function sortEvents(list: CalendarEventData[]): CalendarEventData[] {
  return list.slice().sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const ta = a.startTime ?? "";
    const tb = b.startTime ?? "";
    return ta.localeCompare(tb);
  });
}

// ─────────────────── 自分の現場入り（読み取り専用チップ） ───────────────────
// EVENT 色とは別の識別：ブランド色の破線ボーダー＋ヘルメットアイコン
function VisitChip({ visit, compact = false }: { visit: CalendarVisitData; compact?: boolean }) {
  return (
    <span
      title={`現場入り：${visit.site.name}`}
      className={cn(
        "flex items-center gap-1 rounded-md border border-dashed border-brand-400 bg-brand-50/60 text-brand-700",
        compact ? "px-1 py-0.5 text-[10px] font-semibold" : "px-2 py-1 text-[11px] font-semibold",
      )}
    >
      <HardHat className={compact ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden />
      <span className="truncate">{visit.site.name}</span>
    </span>
  );
}

// リスト表示用（選択日の予定リスト・日ビュー）
function VisitRow({ visit }: { visit: CalendarVisitData }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <HardHat className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{visit.site.name}</p>
        <p className="text-xs text-ink-muted">現場入り（出面）</p>
      </div>
      <Badge tone="brand">現場入り</Badge>
    </div>
  );
}

// 1件の予定サマリー（クリックで詳細モーダルを開く）
function EventRow({
  ev,
  onSelect,
}: {
  ev: CalendarEventData;
  onSelect: (ev: CalendarEventData) => void;
}) {
  const src = ev.source as EventSource;
  const color = EVENT_SOURCE_COLOR[src] ?? EVENT_SOURCE_COLOR.MANUAL;
  const people = ev.participants.length > 0 ? ev.participants : ev.owner ? [ev.owner] : [];
  return (
    <button
      type="button"
      onClick={() => onSelect(ev)}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
    >
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={SOURCE_BADGE_TONE[src] ?? "neutral"}>
            {EVENT_SOURCE_LABEL[src] ?? ev.source}
          </Badge>
          {ev.category && (
            <Badge tone="neutral">
              {EVENT_CATEGORY_LABEL[ev.category as EventCategory] ?? ev.category}
            </Badge>
          )}
          {!ev.allDay && ev.startTime && (
            <span className="flex items-center gap-1 text-xs font-bold tnum text-ink-soft">
              <Clock className="h-3 w-3" />
              {ev.startTime}
              {ev.endTime ? `〜${ev.endTime}` : ""}
            </span>
          )}
          {ev.allDay && (
            <span className="text-xs font-bold text-ink-soft">終日</span>
          )}
        </div>
        <p className="mt-1 text-sm font-semibold leading-snug text-ink">
          {ev.title}
        </p>
        {ev.site && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-brand-600">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{ev.site.name}</span>
          </p>
        )}
        {people.length > 0 && (
          <div className="mt-1.5 flex items-center -space-x-1.5">
            {people.slice(0, 6).map((p) => (
              <Avatar key={p.id} name={p.name} color={p.avatarColor} size="sm" className="h-5 w-5 text-[9px] ring-1 ring-white" />
            ))}
          </div>
        )}
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" />
    </button>
  );
}

// ─────────────────── 予定の詳細モーダル（全ビュー共通） ───────────────────
function EventDetailModal({
  event,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEventData | null;
  onClose: () => void;
  onEdit: (ev: CalendarEventData) => void;
  onDelete: (ev: CalendarEventData) => void;
}) {
  if (!event) return null;
  const ev = event;
  const src = ev.source as EventSource;
  const color = EVENT_SOURCE_COLOR[src] ?? EVENT_SOURCE_COLOR.MANUAL;
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
          <h2 className="text-base font-bold text-ink">予定の詳細</h2>
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
            <Badge tone="neutral">
              {EVENT_CATEGORY_LABEL[ev.category as EventCategory] ?? ev.category}
            </Badge>
          )}
        </div>

        {/* 件名 */}
        <h3 className="mt-2 border-l-[3px] pl-2.5 text-lg font-bold leading-snug text-ink" style={{ borderColor: color }}>
          {ev.title}
        </h3>

        {/* 詳細 */}
        <dl className="mt-3 space-y-2.5 text-sm">
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
                    <Avatar name={p.name} color={p.avatarColor} size="sm" />
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
          {ev.source === "MANUAL" && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onEdit(ev)}>
                <Pencil className="h-4 w-4" />
                編集
              </Button>
              <Button
                variant="ghost"
                className="text-status-danger hover:bg-red-50"
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

// 月セル内のイベントチップ（md 以上のデスクトップ/タブレットで表示）。
// 出所色のドット＋タイトル（＋時刻）をコンパクトに1行で。
function MonthEventChip({
  ev,
  onSelect,
}: {
  ev: CalendarEventData;
  onSelect: (ev: CalendarEventData) => void;
}) {
  const color =
    EVENT_SOURCE_COLOR[ev.source as EventSource] ?? EVENT_SOURCE_COLOR.MANUAL;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(ev);
      }}
      className="flex items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] font-medium leading-tight text-ink-soft hover:bg-surface-sunken"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {!ev.allDay && ev.startTime && (
        <span className="shrink-0 font-bold tnum text-ink-muted">
          {ev.startTime}
        </span>
      )}
      <span className="truncate">{ev.title}</span>
      {/* 誰が行くか：参加者アバターを末尾に添える（最大2名＋残数） */}
      {ev.participants.length > 0 ? (
        <span className="ml-auto flex shrink-0 items-center -space-x-1.5">
          {ev.participants.slice(0, 2).map((p) => (
            <Avatar
              key={p.id}
              name={p.name}
              color={p.avatarColor}
              size="sm"
              className="h-4 w-4 text-[8px] ring-1 ring-white"
            />
          ))}
          {ev.participants.length > 2 && (
            <span className="pl-1 text-[9px] font-bold text-ink-muted">
              +{ev.participants.length - 2}
            </span>
          )}
        </span>
      ) : ev.owner ? (
        <Avatar
          name={ev.owner.name}
          color={ev.owner.avatarColor}
          size="sm"
          className="ml-auto h-4 w-4 shrink-0 text-[8px]"
        />
      ) : null}
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
}: {
  events: CalendarEventData[];
  visits?: CalendarVisitData[];
  view: CalendarViewMode;
  year: number;
  month: number;
  baseDay: string;
  sites: SiteOption[];
  users: UserOption[];
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
  // 月：?ym=YYYY-MM を維持。週/日：?d=基準日 を使う。
  const ymStr = `${year}-${pad(month)}`;
  const monthHref = `/calendar?view=month&ym=${ymStr}`;
  const weekHref = `/calendar?view=week&d=${baseDay}`;
  const dayHref = `/calendar?view=day&d=${baseDay}`;

  return (
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
          自分の現場入り
        </span>
      </div>

      {formOpen && (
        <EventForm
          onClose={closeForm}
          sites={sites}
          users={users}
          defaultDate={formDate ?? baseDay}
          event={editEvent}
        />
      )}

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={handleEdit}
        onDelete={(ev) => setDeleteTarget(ev)}
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
        <p className="text-base font-bold text-ink tnum md:text-xl">
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
              return (
                <div
                  key={key}
                  onClick={() => setSelectedDay(day)}
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
                        : dow === 0
                          ? "text-red-500"
                          : dow === 6
                            ? "text-blue-500"
                            : "text-ink",
                    )}
                  >
                    {day}
                  </span>
                  {/* スマホ：現場入りはヘルメット、予定は出所色のドット（最大4個） */}
                  <span className="mt-0.5 flex min-h-[8px] flex-wrap items-center justify-center gap-0.5 md:hidden">
                    {dayVisits.length > 0 && (
                      <HardHat className="h-2.5 w-2.5 text-brand-600" aria-label="現場入り" />
                    )}
                    {dayEvents.slice(0, 4).map((ev) => (
                      <span
                        key={ev.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            EVENT_SOURCE_COLOR[ev.source as EventSource] ??
                            EVENT_SOURCE_COLOR.MANUAL,
                        }}
                      />
                    ))}
                  </span>
                  {/* md 以上：現場入りチップ＋（ドット＋タイトル）で複数件表示 */}
                  <span className="hidden min-w-0 flex-col gap-0.5 md:flex">
                    {dayVisits.map((v) => (
                      <VisitChip key={v.id} visit={v} compact />
                    ))}
                    {dayEvents.slice(0, 3).map((ev) => (
                      <MonthEventChip key={ev.id} ev={ev} onSelect={onSelect} />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="px-1 text-[11px] font-bold text-ink-muted">
                        ＋{dayEvents.length - 3}件
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 選択日の予定リスト（デスクトップは右レール） */}
        <div className="space-y-2.5 lg:col-span-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-ink-soft md:text-base">
              {fmtDateWithDay(selectedDate)}
            </h2>
            <button
              type="button"
              onClick={() => onAdd(selectedKey)}
              className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white active:scale-95 md:hover:bg-brand-700"
            >
              <Plus className="h-3.5 w-3.5" />
              予定を追加
            </button>
          </div>

          {selectedEvents.length === 0 && selectedVisits.length === 0 ? (
            <EmptyState title="この日の予定はありません" description="「＋予定を追加」から登録できます" />
          ) : (
            <div className="card divide-y divide-line">
              {selectedVisits.map((v) => (
                <VisitRow key={v.id} visit={v} />
              ))}
              {selectedEvents.map((ev) => (
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
  const color = EVENT_SOURCE_COLOR[ev.source as EventSource] ?? EVENT_SOURCE_COLOR.MANUAL;
  const people = ev.participants.length > 0 ? ev.participants : ev.owner ? [ev.owner] : [];
  return (
    <button
      type="button"
      onClick={() => onSelect(ev)}
      className="w-full rounded-lg border-l-[3px] px-2 py-1.5 text-left transition-[filter] hover:brightness-95"
      style={{ borderColor: color, backgroundColor: `${color}12` }}
    >
      <p className="text-[10px] font-bold tnum text-ink-muted">
        {!ev.allDay && ev.startTime ? `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}` : "終日"}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-tight text-ink">{ev.title}</p>
      {ev.site && (
        <p className="mt-0.5 truncate text-[10px] font-medium text-brand-600">{ev.site.name}</p>
      )}
      {people.length > 0 && (
        <div className="mt-1 flex items-center -space-x-1.5">
          {people.slice(0, 4).map((p) => (
            <Avatar key={p.id} name={p.name} color={p.avatarColor} size="sm" className="h-4 w-4 text-[8px] ring-1 ring-white" />
          ))}
          {people.length > 4 && (
            <span className="pl-2 text-[9px] font-bold text-ink-muted">+{people.length - 4}</span>
          )}
        </div>
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
        <p className="text-sm font-bold text-ink tnum md:text-xl">
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
          return (
            <div key={key} className="overflow-hidden rounded-2xl border border-line bg-surface md:flex md:min-h-[calc(100vh-320px)] md:flex-col">
              {/* 日ヘッダー */}
              <div
                className={cn(
                  "flex items-center justify-between border-b border-line px-2 py-1.5",
                  isToday && "bg-brand-50",
                )}
              >
                <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-0">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tnum",
                      isToday
                        ? "bg-brand-600 text-white"
                        : dow === 0
                          ? "text-red-500"
                          : dow === 6
                            ? "text-blue-500"
                            : "text-ink",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-ink-soft",
                    )}
                  >
                    <span className="md:hidden">{WEEKDAYS[dow]}曜</span>
                    <span className="hidden md:inline">{WEEKDAYS[dow]}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(key)}
                  aria-label="この日に予定を追加"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-brand-600 active:bg-brand-100 md:hover:bg-brand-100"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {/* イベント */}
              <div className="space-y-1.5 p-1.5 md:flex-1">
                {dayVisits.map((v) => (
                  <VisitChip key={v.id} visit={v} />
                ))}
                {list.length === 0 && dayVisits.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-ink-faint">予定なし</p>
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
              const color = EVENT_SOURCE_COLOR[ev.source as EventSource] ?? EVENT_SOURCE_COLOR.MANUAL;
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
            const color = EVENT_SOURCE_COLOR[ev.source as EventSource] ?? EVENT_SOURCE_COLOR.MANUAL;
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
                  {ev.site && (
                    <p className="truncate text-[10px] font-medium text-brand-600">{ev.site.name}</p>
                  )}
                  {people.length > 0 && height > 58 && (
                    <div className="mt-1 flex items-center -space-x-1.5">
                      {people.slice(0, 5).map((p) => (
                        <Avatar key={p.id} name={p.name} color={p.avatarColor} size="sm" className="h-4 w-4 text-[8px] ring-1 ring-white" />
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
        <p className={cn("text-base font-bold tnum md:text-xl", isToday ? "text-brand-600" : "text-ink")}>
          {fmtDateWithDay(base)}
        </p>
        <NavArrow
          onClick={() => navigate(`/calendar?view=day&d=${nextKey}`)}
          label="次の日"
          disabled={navPending}
        >
          <ChevronRight className="h-6 w-6" />
        </NavArrow>
      </div>

      <div className="flex justify-end px-1">
        <button
          type="button"
          onClick={() => onAdd(key)}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white active:scale-95 md:hover:bg-brand-700"
        >
          <Plus className="h-3.5 w-3.5" />
          予定を追加
        </button>
      </div>

      {list.length === 0 && dayVisits.length === 0 ? (
        <EmptyState title="この日の予定はありません" description="「＋予定を追加」から登録できます" />
      ) : (
        <>
          {/* スマホ：リスト */}
          <div className="space-y-3 md:hidden">
            {dayVisits.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="px-1 text-xs font-bold text-ink-muted">現場入り</h3>
                <div className="card divide-y divide-line">
                  {dayVisits.map((v) => (
                    <VisitRow key={v.id} visit={v} />
                  ))}
                </div>
              </div>
            )}
            {allDayEvents.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="px-1 text-xs font-bold text-ink-muted">終日</h3>
                <div className="card divide-y divide-line">
                  {allDayEvents.map((ev) => (
                    <EventRow key={ev.id} ev={ev} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            )}
            {timedEvents.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="px-1 text-xs font-bold text-ink-muted">時刻指定</h3>
                <div className="card divide-y divide-line">
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
