"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { X, AlertCircle, CalendarPlus, Check, Save } from "lucide-react";
import { createEvent, updateEvent } from "./actions";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { EVENT_CATEGORY_OPTIONS, EVENT_CATEGORY_LABEL } from "@/lib/constants";
import { cn, toDateInputValue } from "@/lib/utils";

type SiteOption = { id: string; name: string; address?: string | null };
type UserOption = { id: string; name: string; avatarColor?: string };

// 編集対象の予定（CalendarEventData と構造互換。参加者は id を含む）
type EditEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  category: string | null;
  location: string | null;
  note: string | null;
  site: { id: string; name: string } | null;
  participants: { id: string }[];
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass({ size: "lg", className: "w-full" })}
    >
      {pending ? "保存中..." : isEdit ? (
        <><Save className="h-5 w-5" /> 更新する</>
      ) : (
        <><CalendarPlus className="h-5 w-5" /> 予定を登録</>
      )}
    </button>
  );
}

export function EventForm({
  onClose,
  sites,
  users,
  defaultDate,
  event,
}: {
  onClose: () => void;
  sites: SiteOption[];
  users: UserOption[];
  defaultDate: string;
  event?: EditEvent | null;
}) {
  const isEdit = !!event;
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState(event?.site?.id ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [locationTouched, setLocationTouched] = useState(isEdit);
  const [participants, setParticipants] = useState<Set<string>>(
    new Set(event?.participants.map((p) => p.id) ?? []),
  );

  function onSiteChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setSiteId(id);
    if (!locationTouched) {
      const site = sites.find((s) => s.id === id);
      setLocation(site?.address ?? "");
    }
  }

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function action(formData: FormData) {
    setError(null);
    const res = await (isEdit ? updateEvent : createEvent)(formData);
    if (res?.error) {
      setError(res.error);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-6">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />

      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-float md:max-w-lg md:rounded-3xl md:px-6 md:pb-6 md:pt-5">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong md:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{isEdit ? "予定を編集" : "予定を登録"}</h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft active:bg-surface-sunken"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={action} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={event.id} />}

          {/* 現場 */}
          <Field label="現場" htmlFor="siteId" hint="選ぶと参加者は現場入り＝日報に連動">
            <Select id="siteId" name="siteId" value={siteId} onChange={onSiteChange}>
              <option value="">現場を選択しない（個人予定）</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>

          {/* 日時 */}
          <Field label="日付" htmlFor="date" required>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={event ? toDateInputValue(event.date) : defaultDate}
              required
            />
          </Field>

          <label className="flex items-center justify-between rounded-xl border border-line-strong bg-surface px-3.5 py-3">
            <span className="text-sm font-semibold text-ink-soft">終日</span>
            <input
              type="checkbox"
              name="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-6 w-6 rounded-md border-line-strong text-brand-600 focus:ring-brand-100"
            />
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="開始時刻" htmlFor="startTime">
                <Input id="startTime" name="startTime" type="time" defaultValue={event?.startTime ?? "08:00"} />
              </Field>
              <Field label="終了時刻" htmlFor="endTime">
                <Input id="endTime" name="endTime" type="time" defaultValue={event?.endTime ?? "17:00"} />
              </Field>
            </div>
          )}

          {/* カテゴリー */}
          <Field label="カテゴリー" htmlFor="category" hint="任意">
            <Select id="category" name="category" defaultValue={event?.category ?? ""}>
              <option value="">未分類</option>
              {EVENT_CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{EVENT_CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
          </Field>

          {/* 件名（任意） */}
          <Field label="件名" htmlFor="title" hint="任意・未入力ならカテゴリー名">
            <Input id="title" name="title" defaultValue={event?.title ?? ""} placeholder="例：ユニットバス据付" />
          </Field>

          {/* 場所 */}
          <Field label="場所" htmlFor="location" hint="現場を選ぶと住所を自動入力">
            <Input
              id="location"
              name="location"
              value={location}
              onChange={(e) => { setLocation(e.target.value); setLocationTouched(true); }}
              placeholder="例：東京都新宿区…"
            />
          </Field>

          {/* 内容 */}
          <Field label="内容" htmlFor="note" hint="任意">
            <Textarea id="note" name="note" defaultValue={event?.note ?? ""} placeholder="作業内容・持ち物・注意点など" />
          </Field>

          {/* 参加者（現場に行く人・複数選択） */}
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink-soft">
              参加者（現場に行く人）
              {participants.size > 0 && (
                <span className="ml-1.5 font-normal text-brand-600">{participants.size}名</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {users.map((u) => {
                const on = participants.has(u.id);
                return (
                  <label
                    key={u.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-semibold transition-all active:scale-95",
                      on
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-line-strong bg-surface text-ink-soft",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="participants"
                      value={u.id}
                      checked={on}
                      onChange={() => toggleParticipant(u.id)}
                      className="hidden"
                    />
                    <span className="relative">
                      <Avatar name={u.name} color={u.avatarColor} size="sm" />
                      {on && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                          <Check className="h-2.5 w-2.5 text-brand-600" strokeWidth={4} />
                        </span>
                      )}
                    </span>
                    {u.name}
                  </label>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              現場を選んで参加者を指定すると、その人の「今日の現場入り」に反映され、日報につながります。
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <SubmitButton isEdit={isEdit} />
        </form>
      </div>
    </div>
  );
}
