"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, CalendarClock, Loader2 } from "lucide-react";
import { resolveNextWork } from "./actions";
import { checkNearbyEvents } from "@/features/calendar/actions";
import { DuplicateConfirm } from "@/features/calendar/duplicate-confirm";
import type { NearbyEvent } from "@/lib/nearby-events";
import { DateWheelPicker } from "@/components/ui/date-wheel-picker";
import { addDaysKey, jstDateKey } from "@/lib/date";
import { cn, fmtDateWithDay } from "@/lib/utils";

export type NextWorkCheckItem = {
  reportId: string;
  siteId: string;
  siteName: string;
  workDate: Date | string;
  nextCheckDate: Date | string;
};

/**
 * 次回作業日の確認ゲート：日報で「次回の作業日＝未定」にした本人に、確認日が来たら全画面で出す。
 * 「次回の作業日を決める」か「確認日を延期する」まで先に進めない（1件ずつ）。
 * （z-[87]：未入力日報ゲート z-[90] の後ろ、引き継ぎゲート z-[85] の前）
 */
export function NextWorkGate({ items }: { items: NextWorkCheckItem[] }) {
  // この画面で片づけたもの。片づけるとサーバー側の一覧から消えるため、件数は最初に見せた分で数える
  const [done, setDone] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<NextWorkCheckItem[]>(items);
  const seenIds = new Set(seen.map((i) => i.reportId));
  const added = items.filter((i) => !seenIds.has(i.reportId));
  if (added.length > 0) {
    if (seen.every((i) => done.has(i.reportId))) {
      setSeen(items);
      setDone(new Set());
    } else {
      setSeen([...seen, ...added]);
    }
  }
  const live = new Set(items.map((i) => i.reportId));
  const list = [...seen, ...added].filter((i) => done.has(i.reportId) || live.has(i.reportId));
  const remaining = list.filter((i) => !done.has(i.reportId));
  const open = remaining.length > 0;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  const current = remaining[0];
  const index = list.length - remaining.length + 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="次回作業日の確認"
      className="fixed inset-0 z-[87] flex items-center justify-center bg-black/50 p-4 animate-fade-in"
    >
      <NextWorkCard
        key={current.reportId}
        item={current}
        index={index}
        total={list.length}
        onDone={() => setDone((prev) => new Set(prev).add(current.reportId))}
      />
    </div>
  );
}

function NextWorkCard({
  item,
  index,
  total,
  onDone,
}: {
  item: NextWorkCheckItem;
  index: number;
  total: number;
  onDone: () => void;
}) {
  const todayKey = jstDateKey();
  const tomorrowKey = addDaysKey(todayKey, 1);
  const [mode, setMode] = useState<"date" | "postpone">("date");
  const [date, setDate] = useState("");
  const [postpone, setPostpone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // 近い日に同じ現場の予定があったときの確認
  const [dup, setDup] = useState<NearbyEvent[] | null>(null);

  const value = mode === "date" ? date : postpone;
  const ready = !!value;

  function submit() {
    if (!ready || pending) return;
    setError(null);
    start(async () => {
      if (mode === "date") {
        const { events } = await checkNearbyEvents({
          siteId: item.siteId,
          date,
          excludeReportId: item.reportId,
          minDateKey: todayKey,
        });
        if (events.length > 0) {
          setDup(events);
          return;
        }
      }
      const r = await resolveNextWork(item.reportId, mode === "date" ? { date } : { postpone });
      if (r.error) setError(r.error);
      else onDone();
    });
  }

  async function decide(dateKey: string, linkEventId: string | null, notDuplicateOf: string[] = []) {
    setDup(null);
    setDate(dateKey);
    const r = await resolveNextWork(item.reportId, { date: dateKey, linkEventId, notDuplicateOf });
    if (r.error) setError(r.error);
    else onDone();
  }

  return (
    <div className="flex max-h-[88dvh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl bg-surface shadow-float">
      <div className="shrink-0 px-6 pb-5 pt-6">
        <p className="text-xs font-medium tracking-[0.15em] text-ink-muted">確認日になりました</p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-wide text-ink">次回の作業日を決める</h2>
          {total > 1 && (
            <p className="shrink-0 tnum text-ink-muted">
              <span className="text-xl font-bold text-ink">{index}</span>
              <span className="text-sm"> / {total}件</span>
            </p>
          )}
        </div>
        <p className="mt-2.5 break-words text-base font-semibold text-ink">{item.siteName}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-y border-line bg-surface-subtle px-6 py-6">
        <p className="flex items-start gap-2 border-l-[3px] border-amber-500 pl-4 text-[15px] leading-relaxed text-ink">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <span>
            {fmtDateWithDay(new Date(item.workDate))}の日報で、次回の作業日を「未定（
            {fmtDateWithDay(new Date(item.nextCheckDate))}までに確認）」にしていました。
          </span>
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label="決め方">
          {(
            [
              ["date", "日付を決める"],
              ["postpone", "まだ未定（延期）"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "min-h-[44px] rounded-xl border px-2 text-sm font-bold transition-colors",
                mode === m
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line-strong bg-surface text-ink-soft active:bg-surface-sunken",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-ink-soft">
            {mode === "date" ? "次回の作業日（予定に入ります）" : "新しい確認日"}
          </p>
          <div className="mt-1.5">
            {mode === "date" ? (
              <DateWheelPicker title="次回の作業日" min={todayKey} value={date} onChange={setDate} />
            ) : (
              <DateWheelPicker title="新しい確認日" min={tomorrowKey} value={postpone} onChange={setPostpone} />
            )}
          </div>
        </div>
        {mode === "postpone" && (
          <p className="mt-2 text-xs text-ink-muted">新しい確認日の朝に、もう一度お知らせします。</p>
        )}
      </div>

      <div className="shrink-0 px-6 pb-5 pt-5">
        {error && (
          <p role="alert" className="mb-2 text-center text-xs font-semibold text-status-danger">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!ready || pending}
          className={cn(
            "flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl px-4 text-base font-bold tracking-wide transition disabled:cursor-not-allowed",
            ready ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-surface-sunken text-ink-muted",
          )}
        >
          {pending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              記録しています…
            </>
          ) : (
            <>
              {mode === "date" ? "この日に決める" : "確認日を延期する"}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </>
          )}
        </button>
        <p className="mt-4 text-center text-xs text-ink-muted">
          決めた次回の作業日は、現場の予定に「次回工程」として入ります
        </p>
      </div>
      <DuplicateConfirm
        open={!!dup}
        newDateKey={date}
        events={dup ?? []}
        overlayClassName="z-[88]"
        onBack={() => setDup(null)}
        onMerge={(eventId, useNewDate) => {
          const target = dup?.find((e) => e.id === eventId);
          return decide(useNewDate || !target ? date : target.dateKey, eventId);
        }}
        onSeparate={(ids) => decide(date, null, ids)}
      />
    </div>
  );
}
