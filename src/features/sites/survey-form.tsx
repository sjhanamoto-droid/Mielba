"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { saveSurvey } from "./actions";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { PhotoUploader, type UploadPhoto } from "@/components/photo-uploader";

export type SurveyFormData = {
  address: string | null;
  keybox: string | null;
  situationMemo: string | null;
  relatedNote: string | null;
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
  photos = [],
}: {
  siteId: string;
  survey?: SurveyFormData;
  photos?: UploadPhoto[];
}) {
  const action = async (_prev: FormState, formData: FormData): Promise<FormState> => {
    return (await saveSurvey(siteId, formData)) ?? {};
  };
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-3">
          <SectionTitle>現調内容</SectionTitle>
          <Card className="space-y-3 p-4">
            <Field label="住所" htmlFor="address">
              <Input id="address" name="address" defaultValue={survey?.address ?? ""} placeholder="東京都◯◯区…" />
            </Field>
            <Field label="キーBOX" htmlFor="keybox" hint="（設置場所・解錠情報）">
              <Input id="keybox" name="keybox" defaultValue={survey?.keybox ?? ""} />
            </Field>
            <Field label="現場状況メモ" htmlFor="situationMemo" hint="（調査時の所見）">
              <Textarea id="situationMemo" name="situationMemo" defaultValue={survey?.situationMemo ?? ""} />
            </Field>
            <Field label="関連現場メモ" htmlFor="relatedNote" hint="（同一住所・近隣現場）">
              <Textarea id="relatedNote" name="relatedNote" defaultValue={survey?.relatedNote ?? ""} />
            </Field>
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
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          現調内容を保存しました
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
