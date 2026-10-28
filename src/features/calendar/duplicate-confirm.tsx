"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { dateFromKey } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { NearbyEvent } from "@/lib/nearby-events";

// 同じ現場の近い日に作業予定があるときの確認（日報の次回作業日・手動の予定登録・カレンダーの予定詳細で共通）。
// 「どちらの日程が正しいか」を [日付A] [日付B] [どちらも正しい] の1行で選んでもらう。
//   日付を選ぶ → 同じ工事なので1つにまとめる（選んだ日付に寄せる）
//   どちらも正しい → 連日の工事など別の工事。両方残し、以後この組には印を出さない

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function shortDateLabel(key: string): string {
  const d = dateFromKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function timeLabel(e: NearbyEvent): string {
  if (e.allDay || !e.startTime) return "終日";
  return `${e.startTime}${e.endTime ? `〜${e.endTime}` : ""}`;
}

function originLabel(e: { fromReport: boolean; reportAuthor?: string | null }): string {
  if (e.fromReport) return e.reportAuthor ? `${e.reportAuthor}さんの日報の次回作業日` : "日報の次回作業日";
  return "カレンダーで登録";
}

type Choice = { key: string; label: string; sub?: string; onClick: () => void };

/** どちらの日程が正しいか：[日付A] [日付B] [どちらも正しい] の1行 */
export function DateChoiceRow({
  choices,
  onBoth,
  selectedBoth = false,
  disabled = false,
}: {
  choices: Choice[];
  onBoth: () => void;
  selectedBoth?: boolean;
  disabled?: boolean;
}) {
  const pill =
    "flex min-h-[44px] flex-col items-center justify-center rounded-xl border px-1 py-1 text-sm font-bold leading-tight transition-colors disabled:opacity-50";
  return (
    <div className={cn("grid gap-1.5", choices.length === 1 ? "grid-cols-2" : "grid-cols-3")}>
      {choices.map((c) => (
        <button
          key={c.key}
          type="button"
          disabled={disabled}
          onClick={c.onClick}
          className={cn(pill, "border-line-strong bg-surface text-ink active:bg-surface-sunken")}
        >
          <span>{c.label}</span>
          {c.sub && <span className="text-[10px] font-medium text-ink-muted">{c.sub}</span>}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onBoth}
        aria-pressed={selectedBoth}
        className={cn(
          pill,
          selectedBoth
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-line-strong bg-surface text-ink active:bg-surface-sunken",
        )}
      >
        どちらも正しい
      </button>
    </div>
  );
}

/** 2つの日付を古い順に並べた選択肢（同じ日なら「まとめる」1つ） */
function dateChoices(
  a: { key: string; sub: string; onClick: () => void },
  b: { key: string; sub: string; onClick: () => void },
): Choice[] {
  if (a.key === b.key) return [{ key: "same", label: "同じ予定", sub: "1つにまとめる", onClick: a.onClick }];
  const items = [a, b].sort((x, y) => (x.key < y.key ? -1 : 1));
  return items.map((x) => ({ key: x.key, label: shortDateLabel(x.key), sub: x.sub, onClick: x.onClick }));
}

export function DuplicateConfirm({
  open,
  newDateKey,
  events,
  onBack,
  onMerge,
  onSeparate,
  overlayClassName,
}: {
  open: boolean;
  newDateKey: string;
  events: NearbyEvent[];
  /** 閉じて入力に戻る（日付を直す） */
  onBack: () => void;
  /** 同じ工事：eventId の予定にまとめる。useNewDate=true なら今入れた日付が正しい */
  onMerge: (eventId: string, useNewDate: boolean) => void | Promise<void>;
  /** どちらも正しい（全件）：今までどおり新しく入れ、notDuplicateOf の予定とは重複でないと記録する */
  onSeparate: (notDuplicateOf: string[]) => void | Promise<void>;
  overlayClassName?: string;
}) {
  const [pending, setPending] = React.useState(false);
  const [both, setBoth] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!open) setBoth(new Set());
  }, [open]);

  async function run(fn: () => void | Promise<void>) {
    try {
      setPending(true);
      await fn();
    } finally {
      setPending(false);
    }
  }

  function markBoth(id: string) {
    const next = new Set(both).add(id);
    setBoth(next);
    // 全部「どちらも正しい」になったら、そのまま保存する
    if (events.every((e) => next.has(e.id))) void run(() => onSeparate([...next]));
  }

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onBack}
      title="近い日に同じ現場の予定があります"
      overlayClassName={overlayClassName}
    >
      <p className="mb-3 text-sm leading-relaxed text-ink-soft">
        どちらの日程が正しいですか？連日の工事など、両方必要なら「どちらも正しい」を選んでください。
      </p>

      <ul className="space-y-2.5">
        {events.map((e) => (
          <li key={e.id} className="rounded-2xl border border-line bg-surface-subtle p-3">
            <p className="text-xs text-ink-muted">
              <span className="font-bold text-ink">{shortDateLabel(e.dateKey)}</span> {timeLabel(e)}・{originLabel(e)}
              {e.participants.length > 0 && `・${e.participants.join("、")}`}
            </p>
            <div className="mt-2">
              <DateChoiceRow
                disabled={pending}
                selectedBoth={both.has(e.id)}
                onBoth={() => markBoth(e.id)}
                choices={dateChoices(
                  { key: e.dateKey, sub: "登録済み", onClick: () => run(() => onMerge(e.id, false)) },
                  { key: newDateKey, sub: "今回", onClick: () => run(() => onMerge(e.id, true)) },
                )}
              />
            </div>
          </li>
        ))}
      </ul>

      <Button type="button" variant="ghost" className="mt-3 w-full" disabled={pending} onClick={onBack}>
        戻って日付を直す
      </Button>
    </Modal>
  );
}

/** カレンダーの予定詳細に出す「近い日に同じ現場の予定があります」 */
export function NearbyDuplicateNotice({
  eventId,
  dateKey,
  nearby,
  onKeep,
  onBoth,
}: {
  eventId: string;
  dateKey: string;
  nearby: { id: string; dateKey: string; fromReport: boolean }[];
  /** keepId を残して dropId を消す */
  onKeep: (t: { keepId: string; dropId: string; keepKey: string; dropKey: string }) => void;
  /** 両方残す（以後この組には出さない） */
  onBoth: (otherId: string) => void | Promise<void>;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-start gap-1.5 text-sm font-bold text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        近い日に同じ現場の予定があります
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">
        どちらの日程が正しいですか？連日の工事なら「どちらも正しい」でこの表示は消えます。
      </p>
      <ul className="mt-2.5 space-y-2">
        {nearby.map((n) => (
          <li key={n.id} className="rounded-xl bg-surface p-2.5">
            <p className="mb-1.5 text-xs text-ink-muted">
              <span className="font-bold text-ink">{shortDateLabel(n.dateKey)}</span>の予定・{originLabel(n)}
            </p>
            <DateChoiceRow
              disabled={busy === n.id}
              onBoth={async () => {
                setBusy(n.id);
                try {
                  await onBoth(n.id);
                } finally {
                  setBusy(null);
                }
              }}
              choices={
                n.dateKey === dateKey
                  ? [{ key: "same", label: "同じ予定", sub: "1つにまとめる", onClick: () => onKeep({ keepId: eventId, dropId: n.id, keepKey: dateKey, dropKey: n.dateKey }) }]
                  : dateChoices(
                      { key: dateKey, sub: "この予定", onClick: () => onKeep({ keepId: eventId, dropId: n.id, keepKey: dateKey, dropKey: n.dateKey }) },
                      { key: n.dateKey, sub: "もう片方", onClick: () => onKeep({ keepId: n.id, dropId: eventId, keepKey: n.dateKey, dropKey: dateKey }) },
                    )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
