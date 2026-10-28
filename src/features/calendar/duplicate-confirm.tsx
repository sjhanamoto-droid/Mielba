"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { dateFromKey } from "@/lib/date";
import type { NearbyEvent } from "@/lib/nearby-events";

// 同じ現場の近い日に作業予定があるときの確認（日報の次回作業日・手動の予定登録で共通）。
// 「同じ工事か」「どちらの日付が正しいか」を選んでもらい、二重に入るのを防ぐ。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function shortDateLabel(key: string): string {
  const d = dateFromKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function timeLabel(e: NearbyEvent): string {
  if (e.allDay || !e.startTime) return "終日";
  return `${e.startTime}${e.endTime ? `〜${e.endTime}` : ""}`;
}

function originLabel(e: NearbyEvent): string {
  if (e.fromReport) return e.reportAuthor ? `${e.reportAuthor}さんの日報の次回作業日` : "日報の次回作業日";
  return "カレンダーで登録";
}

export function DuplicateConfirm({
  open,
  newDateKey,
  events,
  onBack,
  onMerge,
  onSeparate,
  separateLabel = "別の工事として追加する",
  overlayClassName,
}: {
  open: boolean;
  newDateKey: string;
  events: NearbyEvent[];
  /** 閉じて入力に戻る（日付を直す） */
  onBack: () => void;
  /** 同じ工事：eventId の予定にまとめる。useNewDate=true なら今入れた日付が正しい */
  onMerge: (eventId: string, useNewDate: boolean) => void | Promise<void>;
  /** 別の工事：今までどおり新しく入れる */
  onSeparate: () => void | Promise<void>;
  separateLabel?: string;
  overlayClassName?: string;
}) {
  const [pending, setPending] = React.useState(false);

  async function run(fn: () => void | Promise<void>) {
    try {
      setPending(true);
      await fn();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onBack}
      title="近い日に同じ現場の予定があります"
      overlayClassName={overlayClassName}
    >
      <p className="mb-3 text-sm leading-relaxed text-ink-soft">
        <span className="font-bold text-ink">{shortDateLabel(newDateKey)}</span>
        で入れようとしています。下の予定と同じ工事なら、正しい日付を選んでください（予定は1つにまとまります）。
      </p>

      <ul className="space-y-3">
        {events.map((e) => {
          const sameDay = e.dateKey === newDateKey;
          return (
            <li key={e.id} className="rounded-2xl border border-line bg-surface-subtle p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-bold text-ink">{shortDateLabel(e.dateKey)}</span>
                <span className="text-sm text-ink-soft">{timeLabel(e)}</span>
              </div>
              <p className="mt-0.5 text-xs font-semibold text-ink-muted">{originLabel(e)}</p>
              {e.participants.length > 0 && (
                <p className="mt-1 text-xs text-ink-soft">参加：{e.participants.join("、")}</p>
              )}
              {e.note && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-ink-soft">{e.note}</p>}
              <div className="mt-2.5 grid gap-2">
                {sameDay ? (
                  <Button type="button" disabled={pending} onClick={() => run(() => onMerge(e.id, false))}>
                    同じ工事（この予定にまとめる）
                  </Button>
                ) : (
                  <>
                    <Button type="button" disabled={pending} onClick={() => run(() => onMerge(e.id, true))}>
                      同じ工事・{shortDateLabel(newDateKey)}が正しい
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => onMerge(e.id, false))}
                    >
                      同じ工事・{shortDateLabel(e.dateKey)}が正しい
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => run(onSeparate)}>
          {separateLabel}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onBack}>
          戻って日付を直す
        </Button>
      </div>
    </Modal>
  );
}
