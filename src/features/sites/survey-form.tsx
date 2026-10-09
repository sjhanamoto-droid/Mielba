"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { saveSurvey } from "./actions";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { PhotoUploader, type UploadPhoto } from "@/components/photo-uploader";
import { KeyboxFields, type KeyboxStatus } from "./keybox-fields";
import type { SitePhotoInit } from "./site-photo-field";

export type SurveyFormData = {
  address: string | null;
  keybox: string | null; // 旧：キーBOXの自由記述（表示のみ。今は現場登録と同じ項目に保存）
  situationMemo: string | null;
};

export type SurveyKeyboxData = {
  keyboxStatus: string | null;
  keyboxNumber: string | null;
  keyboxPlace: string | null;
  keyboxNoneReason: string | null;
  keyboxPhotoNoneReason: string | null;
};

type FormState = { error?: string; ok?: boolean };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass({ size: "lg", className: "w-full" })}
    >
      {pending ? "保存中..." : <><Save className="h-5 w-5" />現調を保存</>}
    </button>
  );
}

export function SurveyForm({
  siteId,
  survey,
  keybox,
  keyboxPhotos = [],
  photos = [],
}: {
  siteId: string;
  survey?: SurveyFormData;
  keybox?: SurveyKeyboxData;
  keyboxPhotos?: SitePhotoInit[];
  photos?: UploadPhoto[];
}) {
  // キーBOXは現場登録と同じ入力（あり/なし・番号・設置場所・理由・写真）
  const [keyboxStatus, setKeyboxStatus] = useState<KeyboxStatus>(
    keybox?.keyboxStatus === "NONE" ? "NONE" : "HAS",
  );
  const [keyboxPhotoStatus, setKeyboxPhotoStatus] = useState<KeyboxStatus>(
    keybox?.keyboxPhotoNoneReason ? "NONE" : "HAS",
  );
  const action = async (_prev: FormState, formData: FormData): Promise<FormState> => {
    return (await saveSurvey(siteId, formData)) ?? {};
  };
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-3">
          <SectionTitle>現調内容</SectionTitle>
          <Card className="space-y-4 p-4">
            <Field label="住所" htmlFor="address">
              <Input id="address" name="address" defaultValue={survey?.address ?? ""} placeholder="東京都◯◯区…" />
            </Field>
            <Field label="現場状況メモ" htmlFor="situationMemo" hint="（調査時の所見）">
              <Textarea id="situationMemo" name="situationMemo" defaultValue={survey?.situationMemo ?? ""} />
            </Field>
          </Card>

          {/* キーBOX（現場登録と同じ項目。保存すると現場の「現場入り情報」に反映される） */}
          <SectionTitle>キーBOX</SectionTitle>
          <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <KeyboxFields
              keyboxStatus={keyboxStatus}
              setKeyboxStatus={setKeyboxStatus}
              keyboxPhotoStatus={keyboxPhotoStatus}
              setKeyboxPhotoStatus={setKeyboxPhotoStatus}
              initial={keybox}
              keyboxPhotos={keyboxPhotos}
            />
            {/* 旧形式（自由記述）で入れていたキーBOXの情報は表示だけ残す */}
            {survey?.keybox && (
              <div className="rounded-xl bg-surface-sunken px-3.5 py-3 sm:col-span-2">
                <p className="text-xs font-semibold text-ink-muted">以前のキーBOXメモ（表示のみ）</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{survey.keybox}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <SectionTitle>現調写真</SectionTitle>
          <Card className="p-4">
            <PhotoUploader name="photos" defaultKind="SURVEY" initial={photos} />
          </Card>
        </div>
      </div>

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          現調内容を保存しました
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
