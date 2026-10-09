"use client";

import { KeyRound } from "lucide-react";
import { SitePhotoField, type SitePhotoInit } from "./site-photo-field";
import { Field, Input, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export type KeyboxStatus = "HAS" | "NONE";

/**
 * キーBOXの入力欄（あり/なし・番号・設置場所・無い理由・キーBOX写真 or 撮れない理由）。
 * 現場の登録・編集と現調フォーマットで同じものを使う。親の Card（grid sm:grid-cols-2）の中に置く。
 * 値は keyboxStatus / keyboxNumber / keyboxPlace / keyboxNoneReason / keyboxPhotoStatus /
 * keyboxPhotos / keyboxPhotoNoneReason の名前でフォームに送る。
 */
export function KeyboxFields({
  keyboxStatus,
  setKeyboxStatus,
  keyboxPhotoStatus,
  setKeyboxPhotoStatus,
  initial,
  keyboxPhotos,
}: {
  keyboxStatus: KeyboxStatus;
  setKeyboxStatus: (v: KeyboxStatus) => void;
  keyboxPhotoStatus: KeyboxStatus;
  setKeyboxPhotoStatus: (v: KeyboxStatus) => void;
  initial?: {
    keyboxNumber: string | null;
    keyboxPlace: string | null;
    keyboxNoneReason: string | null;
    keyboxPhotoNoneReason: string | null;
  } | null;
  keyboxPhotos: SitePhotoInit[];
}) {
  const site = initial;
  return (
    <>
      {/* キーBOX あり/なし の切替（あり→番号・場所、なし→理由） */}
      <div className="sm:col-span-2">
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
          <KeyRound className="h-4 w-4 text-ink-muted" />
          キーBOX
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/50 dark:text-red-300">必須</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["HAS", "NONE"] as const).map((v) => (
            <label
              key={v}
              className={cn(
                "flex min-h-[44px] min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
                keyboxStatus === v
                  ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                  : "border-line-strong bg-surface text-ink-soft",
              )}
            >
              <input
                type="radio"
                name="keyboxStatus"
                value={v}
                checked={keyboxStatus === v}
                onChange={() => setKeyboxStatus(v)}
                className="sr-only"
              />
              {v === "HAS" ? "あり" : "なし"}
            </label>
          ))}
        </div>
      </div>

      {keyboxStatus === "HAS" ? (
        <>
          <Field label="キーBOX番号" required htmlFor="keyboxNumber">
            <Input id="keyboxNumber" name="keyboxNumber" defaultValue={site?.keyboxNumber ?? ""} placeholder="1234" />
          </Field>
          <Field label="キーBOX設置場所" htmlFor="keyboxPlace">
            <Input id="keyboxPlace" name="keyboxPlace" defaultValue={site?.keyboxPlace ?? ""} placeholder="玄関脇のガスメーター横" />
          </Field>
        </>
      ) : (
        <Field label="キーBOXが無い理由" required htmlFor="keyboxNoneReason" className="sm:col-span-2">
          <Textarea
            id="keyboxNoneReason"
            name="keyboxNoneReason"
            defaultValue={site?.keyboxNoneReason ?? ""}
            placeholder="例：オートロックのため管理人から都度受け取る"
          />
        </Field>
      )}

      <div className="sm:col-span-2">
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
          <KeyRound className="h-4 w-4 text-ink-muted" />
          キーBOXの写真
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/50 dark:text-red-300">必須</span>
        </p>
        {/* 写真あり / なし の切替（なし→理由が必須） */}
        <div className="mb-2 grid grid-cols-2 gap-2">
          {(["HAS", "NONE"] as const).map((v) => (
            <label
              key={v}
              className={cn(
                "flex min-h-[44px] min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
                keyboxPhotoStatus === v
                  ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                  : "border-line-strong bg-surface text-ink-soft",
              )}
            >
              <input
                type="radio"
                name="keyboxPhotoStatus"
                value={v}
                checked={keyboxPhotoStatus === v}
                onChange={() => setKeyboxPhotoStatus(v)}
                className="sr-only"
              />
              {v === "HAS" ? "写真あり" : "なし"}
            </label>
          ))}
        </div>
        {keyboxPhotoStatus === "HAS" ? (
          <SitePhotoField name="keyboxPhotos" kind="KEYBOX" initial={keyboxPhotos} />
        ) : (
          <Field label="キーBOX写真が無い理由" required htmlFor="keyboxPhotoNoneReason">
            <Textarea
              id="keyboxPhotoNoneReason"
              name="keyboxPhotoNoneReason"
              defaultValue={site?.keyboxPhotoNoneReason ?? ""}
              placeholder="例：オートロックで共用部の撮影が禁止されているため"
            />
          </Field>
        )}
      </div>
    </>
  );
}
