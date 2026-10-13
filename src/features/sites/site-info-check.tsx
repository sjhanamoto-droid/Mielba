"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { saveSiteEntryInfo } from "./actions";
import { KeyboxFields, type KeyboxStatus } from "./keybox-fields";
import type { SitePhotoInit } from "./site-photo-field";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import type { SiteEntryMissing } from "@/lib/site-entry";

/**
 * 日報を書く前の「現場情報の確認」（仮登録の現場・メインの人だけ）。
 * 現場で分かる項目（住所・キーBOX・キーBOX写真）のうち足りないものだけを聞く。
 * 「保存して日報へ」で現場に保存して日報へ、「あとで」は保存せず日報へ（次に日報を開くとまた出る）。
 */
export function SiteInfoCheck({
  siteId,
  siteName,
  missing,
  initial,
  keyboxPhotos,
  continueHref,
}: {
  siteId: string;
  siteName: string;
  missing: SiteEntryMissing;
  initial: {
    address: string | null;
    keyboxStatus: string | null;
    keyboxNumber: string | null;
    keyboxPlace: string | null;
    keyboxNoneReason: string | null;
    keyboxPhotoNoneReason: string | null;
  };
  keyboxPhotos: SitePhotoInit[];
  /** 確認を済ませた（または「あとで」）あとに進む日報の入力画面 */
  continueHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [keyboxStatus, setKeyboxStatus] = useState<KeyboxStatus>(
    initial.keyboxStatus === "NONE" ? "NONE" : "HAS",
  );
  const [keyboxPhotoStatus, setKeyboxPhotoStatus] = useState<KeyboxStatus>(
    initial.keyboxPhotoNoneReason ? "NONE" : "HAS",
  );
  const showKeybox = missing.keybox || missing.keyboxPhoto;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await saveSiteEntryInfo(siteId, fd);
      if (r.error) setError(r.error);
      else router.push(continueHref);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="alert-warn flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <b className="font-bold">{siteName}</b> は<b className="font-bold">仮登録</b>です。
          日報の前に、現場で分かる情報を入れてください。分からないものは空のままで大丈夫です。
        </span>
      </div>

      <input type="hidden" name="showAddress" value={missing.address ? "1" : "0"} />
      <input type="hidden" name="showKeybox" value={showKeybox ? "1" : "0"} />

      {missing.address && (
        <Card className="p-4">
          <Field label="住所" htmlFor="address">
            <Input id="address" name="address" defaultValue={initial.address ?? ""} placeholder="東京都◯◯区…" />
          </Field>
        </Card>
      )}

      {showKeybox && (
        <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <KeyboxFields
            keyboxStatus={keyboxStatus}
            setKeyboxStatus={setKeyboxStatus}
            keyboxPhotoStatus={keyboxPhotoStatus}
            setKeyboxPhotoStatus={setKeyboxPhotoStatus}
            initial={initial}
            keyboxPhotos={keyboxPhotos}
          />
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          保存して日報へ
          {!pending && <ArrowRight className="h-5 w-5" aria-hidden />}
        </button>
        <Link
          href={continueHref}
          className={buttonClass({ variant: "ghost", size: "md", className: "w-full text-ink-muted" })}
        >
          あとで（日報へ進む）
        </Link>
      </div>
    </form>
  );
}
