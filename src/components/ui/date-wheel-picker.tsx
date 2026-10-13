"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, X } from "lucide-react";
import { jstDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";
import { dayTone } from "@/lib/holidays";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 曜日（土＝青、日・祝＝赤）。曜日の文字だけ色を付ける */
function Weekday({ dateKey, className }: { dateKey: string; className?: string }) {
  const { y, m, d } = parse(dateKey);
  const dow = new Date(y, m - 1, d).getDay();
  const tone = dayTone(dateKey, dow);
  return (
    <span
      className={cn(
        tone === "saturday" ? "text-blue-500" : tone ? "text-red-500" : undefined,
        className,
      )}
    >
      ({WEEKDAYS[dow]})
    </span>
  );
}

// 年・月・日を縦に回して選ぶ日付入力（スマホの「ドラム式」）。
// 押すと下からシートが出て、年／月／日のドラムを回して「OK」で決める。
// 値は "YYYY-MM-DD"。未選択で開いたときは今日（範囲外なら範囲内の一番近い日）から始まる。

const ITEM_H = 40; // 1行の高さ(px)
const VISIBLE = 5; // 見える行数（真ん中が選択中）

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return { y, m, d };
};
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const clampKey = (k: string, min?: string, max?: string) =>
  min && k < min ? min : max && k > max ? max : k;

/** 1列のドラム。スクロールで止まった位置（またはタップした行）を選ぶ */
function Wheel({
  items,
  index,
  onIndex,
  label,
}: {
  items: { key: string; label: React.ReactNode }[];
  index: number;
  onIndex: (i: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // 選択が変わったら（開いた直後・日数の変化を含む）その行へ合わせる
  useEffect(() => {
    ref.current?.scrollTo({ top: index * ITEM_H });
  }, [index, items.length]);

  function onScroll() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
      if (i !== index) onIndex(i);
      else el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    }, 120);
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      onScroll={onScroll}
      className="relative z-10 flex-1 snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        height: ITEM_H * VISIBLE,
        paddingTop: ITEM_H * 2,
        paddingBottom: ITEM_H * 2,
        // 上下を薄くして、真ん中の行が浮いて見えるように
        maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
      }}
    >
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          role="option"
          aria-selected={i === index}
          onClick={() => onIndex(i)}
          className={cn(
            "flex w-full snap-center items-center justify-center tnum transition-colors",
            i === index ? "text-2xl font-semibold text-ink" : "text-lg text-ink-faint",
          )}
          style={{ height: ITEM_H }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function DateWheelPicker({
  id,
  name,
  value,
  onChange,
  min,
  max,
  title = "日付を選ぶ",
  placeholder = "日付を選ぶ",
  className,
}: {
  id?: string;
  /** フォームに送るときの name（hidden input） */
  name?: string;
  /** "YYYY-MM-DD" または ""（未選択） */
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  /** シートの見出し */
  title?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value);

  // 開くとき：選択済みならその日、未選択なら今日（範囲外なら範囲内の一番近い日）
  function openSheet() {
    setTemp(clampKey(value || jstDateKey(), min, max));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = parse(jstDateKey());
  const minY = min ? parse(min).y : today.y - 2;
  const maxY = max ? parse(max).y : today.y + 3;
  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => minY + i);
  const t = temp ? parse(temp) : today;
  const dim = daysIn(t.y, t.m);

  // 列を変えたとき：日がその月の日数を超えたら月末に寄せ、範囲外なら範囲内に寄せる
  const setYMD = (y: number, m: number, d: number) =>
    setTemp(clampKey(toKey(y, m, Math.min(d, daysIn(y, m))), min, max));

  const display = value ? value.replaceAll("-", "/") : "";

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        type="button"
        onClick={openSheet}
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-left text-base transition-colors hover:border-brand-300",
          className,
        )}
      >
        <CalendarDays className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
        <span className={cn("tnum", display ? "text-ink" : "text-ink-faint")}>
          {display || placeholder}
          {value && <Weekday dateKey={value} className="ml-0.5" />}
        </span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
            <button
              type="button"
              aria-label="閉じる"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/40"
            />
            <div className="relative w-full max-w-md rounded-t-3xl bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-float animate-fade-in md:rounded-2xl md:pb-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink">{title}</h2>
                <button
                  type="button"
                  aria-label="閉じる"
                  onClick={() => setOpen(false)}
                  className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft active:bg-surface-sunken"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="relative mt-3 flex gap-1">
                {/* 選択中の行の帯 */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-0 rounded-lg bg-surface-sunken"
                  style={{ top: ITEM_H * 2, height: ITEM_H }}
                />
                <Wheel
                  label="年"
                  items={years.map((y) => ({ key: String(y), label: `${y}年` }))}
                  index={Math.max(0, years.indexOf(t.y))}
                  onIndex={(i) => setYMD(years[i], t.m, t.d)}
                />
                <Wheel
                  label="月"
                  items={Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), label: `${i + 1}月` }))}
                  index={t.m - 1}
                  onIndex={(i) => setYMD(t.y, i + 1, t.d)}
                />
                <Wheel
                  label="日"
                  items={Array.from({ length: dim }, (_, i) => ({
                    key: String(i + 1),
                    label: (
                      <>
                        {i + 1}日
                        <Weekday dateKey={toKey(t.y, t.m, i + 1)} className="ml-0.5 text-[0.75em]" />
                      </>
                    ),
                  }))}
                  index={Math.min(t.d, dim) - 1}
                  onIndex={(i) => setYMD(t.y, t.m, i + 1)}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  onChange(clampKey(temp, min, max));
                  setOpen(false);
                }}
                className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white hover:bg-brand-700"
              >
                OK
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
