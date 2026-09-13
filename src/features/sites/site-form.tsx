"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle, AlertTriangle, ChevronDown, KeyRound, FileText, CalendarRange, Info } from "lucide-react";
import { createSite, updateSite } from "./actions";
import { SitePhotoField, type SitePhotoInit } from "./site-photo-field";
import { PhotoUploader, type UploadPhoto } from "@/components/photo-uploader";
import { DeleteSiteButton } from "./delete-site-button";
import { SiteBackToSurvey } from "./site-survey-actions";
import { Card, SectionTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { cn, toDateInputValue } from "@/lib/utils";
import {
  PROJECT_TYPE_LABEL,
  BILLING_STATUS_LABEL,
  type ProjectType,
  type BillingStatus,
  type SiteEntryMode,
  isPreOrderSite,
  hasOrderedRecord,
} from "@/lib/constants";

type CustomerOption = { id: string; name: string };

export type SiteFormData = {
  id: string;
  customerId: string;
  name: string;
  projectCode: string | null;
  constructionCode: string | null;
  projectType: string;
  projectStatus: string;
  siteStatus: string;
  billingStatus: string | null;
  locationName: string | null;
  address: string | null;
  keybox: string | null;
  siteContactName: string | null;
  siteContactPhone: string | null;
  keyboxStatus: string | null;
  keyboxNumber: string | null;
  keyboxPlace: string | null;
  keyboxNoneReason: string | null;
  keyboxPhotoNoneReason: string | null;
  drawingNoneReason: string | null;
  scheduleNoneReason: string | null;
  targetManDays: number | null;
  finalManDays: number | null;
  receivedDate: Date | string | null;
  contractNumber: string | null;
  departmentInCharge: string | null;
  siteManager: string | null;
  salesRep: string | null;
  plannedStartDate: Date | string | null;
  plannedEndDate: Date | string | null;
  actualStartDate: Date | string | null;
  actualEndDate: Date | string | null;
  handoverNote: string | null;
};

/** 現場に直付けされた既存写真（kind ごとにアップローダーへ渡す） */
export type SiteFormPhoto = SitePhotoInit & { kind: string };

type FormState = { error?: string };

const PROJECT_TYPES: ProjectType[] = ["REFORM", "RENOVATION", "NEWBUILD", "MAINTENANCE"];
const BILLING_STATUSES: BillingStatus[] = ["UNBILLED", "BILLED", "PARTIAL", "PAID"];

// SitePhotoField の hidden JSON（{id} 維持 or {dataUrl,...} 新規の配列）から枚数を数える。
// 空文字 / "[]" / 不正は 0 枚。サーバー側 computeProvisional（kept+added）と一致させる。
function countPhotosField(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass({ size: "lg", className: "w-full" })}
    >
      {pending ? (
        "保存中..."
      ) : (
        <>
          <Save className="h-5 w-5" />
          {isEdit ? "変更を保存" : "現場を作成"}
        </>
      )}
    </button>
  );
}

export function SiteForm({
  customers,
  site,
  sitePhotos = [],
  surveyPhotos = [],
  admin = false,
}: {
  customers: CustomerOption[];
  site?: SiteFormData;
  sitePhotos?: SiteFormPhoto[];
  /** 現調の写真・動画（現調フォーマットと同じ置き場所。編集時は既存分を渡す） */
  surveyPhotos?: UploadPhoto[];
  /** 管理者か（受注済 → 現調に戻す操作は管理者のみ） */
  admin?: boolean;
}) {
  const isEdit = !!site;
  // 現調 = これから見に行く現場。基本だけ登録し、記録は現調フォーマットに残す。
  // 受注済 = 従来どおり全項目を入力する。編集時は現場の区分から決まる（切替は現場詳細から）。
  const [entryMode, setEntryMode] = useState<SiteEntryMode>(
    site ? (isPreOrderSite(site.siteStatus) ? "SURVEY" : "ORDERED") : "ORDERED",
  );
  const surveyMode = entryMode === "SURVEY";

  const action = async (_prev: FormState, formData: FormData): Promise<FormState> => {
    if (site) {
      return (await updateSite(site.id, formData)) ?? {};
    }
    return (await createSite(formData)) ?? {};
  };

  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  // キーBOX あり(HAS)/なし(NONE) の切替（初期値は既存値、未設定なら「あり」）
  const [keyboxStatus, setKeyboxStatus] = useState<"HAS" | "NONE">(
    site?.keyboxStatus === "NONE" ? "NONE" : "HAS",
  );
  // キーBOX写真 あり(HAS)/撮れない(NONE) の切替（既存の「撮れない理由」があれば NONE 初期化）
  const [keyboxPhotoStatus, setKeyboxPhotoStatus] = useState<"HAS" | "NONE">(
    site?.keyboxPhotoNoneReason ? "NONE" : "HAS",
  );
  // 図面 あり(HAS)/なし(NONE) の切替（既存の「無い理由」があれば NONE 初期化）
  const [drawingStatus, setDrawingStatus] = useState<"HAS" | "NONE">(
    site?.drawingNoneReason ? "NONE" : "HAS",
  );
  // 工程表 あり(HAS)/なし(NONE) の切替
  const [scheduleStatus, setScheduleStatus] = useState<"HAS" | "NONE">(
    site?.scheduleNoneReason ? "NONE" : "HAS",
  );
  // クライアント側のハード必須エラー（サーバ state.error とは別に即時表示する）
  const [clientError, setClientError] = useState<string | null>(null);

  // ── 不完全時の確認ダイアログ制御 ──
  // 本登録の必須が未充足のまま送信しようとしたら確認を挟む。OK なら bypassRef を立てて
  // requestSubmit で再送信し、2 回目の onSubmit はフラグで素通しする（無限ループ防止）。
  const formRef = useRef<HTMLFormElement>(null);
  const bypassRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // クライアント側の本登録判定（サーバー computeProvisional と同一ロジック）
  function isRegistrationComplete(fd: FormData): boolean {
    const address = ((fd.get("address") as string | null) ?? "").trim();
    const keyboxNumber = ((fd.get("keyboxNumber") as string | null) ?? "").trim();
    const keyboxNoneReason = ((fd.get("keyboxNoneReason") as string | null) ?? "").trim();
    const keyboxPhotoNoneReason = ((fd.get("keyboxPhotoNoneReason") as string | null) ?? "").trim();
    const hasAddress = address !== "";
    const keyboxOk = keyboxStatus === "HAS" ? keyboxNumber !== "" : keyboxNoneReason !== "";
    const hasKeyboxPhoto =
      keyboxPhotoStatus === "HAS"
        ? countPhotosField(fd.get("keyboxPhotos")) > 0
        : keyboxPhotoNoneReason !== "";
    const drawingNoneReason = ((fd.get("drawingNoneReason") as string | null) ?? "").trim();
    const scheduleNoneReason = ((fd.get("scheduleNoneReason") as string | null) ?? "").trim();
    const hasDrawing =
      drawingStatus === "HAS"
        ? countPhotosField(fd.get("drawingPhotos")) > 0
        : drawingNoneReason !== "";
    const hasSchedule =
      scheduleStatus === "HAS"
        ? countPhotosField(fd.get("schedulePhotos")) > 0
        : scheduleNoneReason !== "";
    const hasDocument = hasDrawing && hasSchedule;
    return hasAddress && keyboxOk && hasKeyboxPhoto && hasDocument;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // 確認済み（モーダルで「はい」）なら素通しして本来の送信を行う
    if (bypassRef.current) {
      bypassRef.current = false;
      return;
    }
    // 現調は情報が揃っていないのが普通。必須チェックも仮登録の確認も出さない。
    if (surveyMode) return;
    const fd = new FormData(e.currentTarget);
    setClientError(null);
    // ── ハード必須：理由が空なら保存させない（仮登録もさせない）──
    if (keyboxStatus === "NONE" && ((fd.get("keyboxNoneReason") as string | null) ?? "").trim() === "") {
      e.preventDefault();
      setClientError("キーBOXが無い理由を入力してください");
      return;
    }
    if (keyboxPhotoStatus === "NONE" && ((fd.get("keyboxPhotoNoneReason") as string | null) ?? "").trim() === "") {
      e.preventDefault();
      setClientError("キーBOX写真が無い理由を入力してください");
      return;
    }
    if (drawingStatus === "NONE" && ((fd.get("drawingNoneReason") as string | null) ?? "").trim() === "") {
      e.preventDefault();
      setClientError("図面が無い理由を入力してください");
      return;
    }
    if (scheduleStatus === "NONE" && ((fd.get("scheduleNoneReason") as string | null) ?? "").trim() === "") {
      e.preventDefault();
      setClientError("工程表が無い理由を入力してください");
      return;
    }
    // 揃っていれば確認なしで本登録。揃っていなければ送信を止めて確認ダイアログを出す。
    if (!isRegistrationComplete(fd)) {
      e.preventDefault();
      setConfirmOpen(true);
    }
  }

  const keyboxPhotos = sitePhotos.filter((p) => p.kind === "KEYBOX");
  const drawingPhotos = sitePhotos.filter((p) => p.kind === "DRAWING");
  const schedulePhotos = sitePhotos.filter((p) => p.kind === "SCHEDULE");

  return (
    <div className="space-y-4">
    <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="entryMode" value={entryMode} />
      {/* 種別は「詳細設定」にあり現調では出さないため、既定値を送る（受注済にしてから直せる） */}
      {surveyMode && (
        <input type="hidden" name="projectType" value={site?.projectType ?? "REFORM"} />
      )}

      {/* どちらの現場を作るかを先に選ぶ（新規のみ。既存の区分は現場詳細から変える） */}
      {!isEdit && (
        <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-sunken p-1">
          {([["SURVEY", "現調"], ["ORDERED", "受注済"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setEntryMode(m)}
              aria-pressed={entryMode === m}
              className={cn(
                "flex h-10 items-center justify-center rounded-full text-sm font-bold transition-colors",
                entryMode === m
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted active:bg-surface-subtle",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {surveyMode ? (
        /* 現調の注記（この段階では基本だけでよいことを伝える） */
        <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-xs leading-relaxed text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/50 dark:text-violet-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {site && hasOrderedRecord(site.siteStatus, site.projectStatus) ? (
              <>
                受注済から現調に戻した現場です。ここでは基本の項目だけを直せますが、
                <b className="font-bold">キーBOX・図面・工程表・日程などの入力はそのまま残しています</b>
                （現場情報で確認できます）。現場詳細から受注済にすると、戻す前の工程で再び編集できます。
              </>
            ) : site?.siteStatus === "DECLINED" ? (
              <>
                見送りにした現場です。基本の項目だけを直せます。話が戻ったら現場詳細から
                <b className="font-bold">現調に戻す</b>と、受注済へ進められます。
              </>
            ) : (
              <>
                これから見に行く現場です。<b className="font-bold">元請企業・案件名・住所</b>だけで登録できます。
                見てきた内容は現場詳細の<b className="font-bold">現調フォーマット</b>に残し、
                受注が決まったら<b className="font-bold">受注済</b>に切り替えます。
              </>
            )}
          </span>
        </div>
      ) : (
        /* 仮登録の注記（必須が未入力でも保存できるが仮登録扱いになる） */
        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs leading-relaxed text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            未入力があると<b className="font-bold">仮登録</b>になります。本登録に必要な項目：
            <b className="font-bold">住所・キーBOX・キーBOX写真・図面/工程表</b>
          </span>
        </div>
      )}

      {/* 基本 */}
      <div className="space-y-3">
        <SectionTitle>基本</SectionTitle>
        <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="元請企業" required htmlFor="customerId" className="sm:col-span-2">
            <Select id="customerId" name="customerId" defaultValue={site?.customerId ?? ""} required>
              <option value="" disabled>
                選択してください
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="案件名" required htmlFor="name" className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={site?.name ?? ""} placeholder="◯◯邸 浴室改修工事" required />
          </Field>
          <Field label="場所（住所）" required htmlFor="address" className="sm:col-span-2">
            <Input id="address" name="address" required defaultValue={site?.address ?? ""} placeholder="東京都◯◯区…" />
          </Field>
          <Field label="現場担当者（元請側）" htmlFor="siteContactName">
            <Input id="siteContactName" name="siteContactName" defaultValue={site?.siteContactName ?? ""} placeholder="山田 太郎" />
          </Field>
          <Field label="担当者の電話番号" htmlFor="siteContactPhone">
            <Input
              id="siteContactPhone"
              name="siteContactPhone"
              type="tel"
              inputMode="tel"
              defaultValue={site?.siteContactPhone ?? ""}
              placeholder="090-1234-5678"
            />
          </Field>
        </Card>
      </div>

      {/* 現調のメモは現場メモ（連絡・メモの時系列）に1件として残す。
          修正画面では出さない（追記は現場詳細の現場メモから行う）。 */}
      {surveyMode && (
        <div className="space-y-3">
          {!isEdit && (
            <>
              <SectionTitle>メモ</SectionTitle>
              <Card className="p-4">
                <Field
                  label="メモ"
                  htmlFor="siteMemo"
                  hint="任意・現場の「連絡・メモ」に残ります"
                >
                  <Textarea
                    id="siteMemo"
                    name="siteMemo"
                    placeholder="例：現調は午前中のみ入れます。鍵は管理人室。"
                  />
                </Field>
              </Card>
            </>
          )}

          {/* 写真・動画。置き場所は現調フォーマットと同じなので、後から現調フォーマットでも増やせる。 */}
          <SectionTitle>写真・動画</SectionTitle>
          <Card className="p-4">
            <PhotoUploader name="surveyPhotos" defaultKind="SURVEY" initial={surveyPhotos} />
          </Card>
        </div>
      )}

      {/* 現調では以下を出さない（見てきてから決まる項目のため） */}
      {!surveyMode && (
      <>
      {/* 現場入り情報 */}
      <div className="space-y-3">
        <SectionTitle>現場入り情報</SectionTitle>
        <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
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
        </Card>
      </div>

      {/* 資料 */}
      <div className="space-y-3">
        <SectionTitle>資料</SectionTitle>
        <Card className="space-y-4 p-4">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
              <FileText className="h-4 w-4 text-ink-muted" />
              図面 <span className="font-normal text-ink-faint">（画像・PDF可）</span>
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/50 dark:text-red-300">必須</span>
            </p>
            {/* 図面あり / なし の切替（なし→理由が必須） */}
            <div className="mb-2 grid grid-cols-2 gap-2">
              {(["HAS", "NONE"] as const).map((v) => (
                <label
                  key={v}
                  className={cn(
                    "flex min-h-[44px] min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
                    drawingStatus === v
                      ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                      : "border-line-strong bg-surface text-ink-soft",
                  )}
                >
                  <input
                    type="radio"
                    name="drawingStatus"
                    value={v}
                    checked={drawingStatus === v}
                    onChange={() => setDrawingStatus(v)}
                    className="sr-only"
                  />
                  {v === "HAS" ? "図面あり" : "なし"}
                </label>
              ))}
            </div>
            {drawingStatus === "HAS" ? (
              <SitePhotoField name="drawingPhotos" kind="DRAWING" allowPdf initial={drawingPhotos} buttonLabel="図面を追加" />
            ) : (
              <Field label="図面が無い理由" required htmlFor="drawingNoneReason">
                <Textarea
                  id="drawingNoneReason"
                  name="drawingNoneReason"
                  defaultValue={site?.drawingNoneReason ?? ""}
                  placeholder="例：既存図面が無く、現地調査で対応するため"
                />
              </Field>
            )}
          </div>
          <div className="border-t border-line pt-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
              <CalendarRange className="h-4 w-4 text-ink-muted" />
              工程表 <span className="font-normal text-ink-faint">（画像・PDF可）</span>
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/50 dark:text-red-300">必須</span>
            </p>
            {/* 工程表あり / なし の切替（なし→理由が必須） */}
            <div className="mb-2 grid grid-cols-2 gap-2">
              {(["HAS", "NONE"] as const).map((v) => (
                <label
                  key={v}
                  className={cn(
                    "flex min-h-[44px] min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
                    scheduleStatus === v
                      ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                      : "border-line-strong bg-surface text-ink-soft",
                  )}
                >
                  <input
                    type="radio"
                    name="scheduleStatus"
                    value={v}
                    checked={scheduleStatus === v}
                    onChange={() => setScheduleStatus(v)}
                    className="sr-only"
                  />
                  {v === "HAS" ? "工程表あり" : "なし"}
                </label>
              ))}
            </div>
            {scheduleStatus === "HAS" ? (
              <SitePhotoField name="schedulePhotos" kind="SCHEDULE" allowPdf initial={schedulePhotos} buttonLabel="工程表を追加" />
            ) : (
              <Field label="工程表が無い理由" required htmlFor="scheduleNoneReason">
                <Textarea
                  id="scheduleNoneReason"
                  name="scheduleNoneReason"
                  defaultValue={site?.scheduleNoneReason ?? ""}
                  placeholder="例：短期工事で工程表を作成しないため"
                />
              </Field>
            )}
          </div>
        </Card>
      </div>

      {/* 管理 */}
      <div className="space-y-3">
        <SectionTitle>管理</SectionTitle>
        <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="目標人工" htmlFor="targetManDays" hint="（延べ人数）" className="sm:col-span-2">
            <Input
              id="targetManDays"
              name="targetManDays"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={site?.targetManDays ?? ""}
              placeholder="20"
            />
          </Field>
          {/* 最終人工は提出日報の累計から自動計算するため入力欄は廃止 */}
          {/* 進捗（配線→…→完了）は現場詳細のステッパーで管理するため、ここでは状態欄を持たない */}
        </Card>
      </div>

      {/* 詳細設定（折りたたみ） */}
      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-ink-soft [&::-webkit-details-marker]:hidden">
          詳細設定
          <ChevronDown className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-line p-4 sm:grid-cols-2">
          <Field label="案件コード" htmlFor="projectCode">
            <Input id="projectCode" name="projectCode" defaultValue={site?.projectCode ?? ""} />
          </Field>
          <Field label="工事コード" htmlFor="constructionCode">
            <Input id="constructionCode" name="constructionCode" defaultValue={site?.constructionCode ?? ""} />
          </Field>
          <Field label="種別" htmlFor="projectType">
            <Select id="projectType" name="projectType" defaultValue={site?.projectType ?? "REFORM"}>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROJECT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="受注日" htmlFor="receivedDate">
            <Input id="receivedDate" name="receivedDate" type="date" defaultValue={toDateInputValue(site?.receivedDate)} />
          </Field>
          <Field label="契約書番号" htmlFor="contractNumber">
            <Input id="contractNumber" name="contractNumber" defaultValue={site?.contractNumber ?? ""} />
          </Field>
          <Field label="作業場所名" htmlFor="locationName" className="sm:col-span-2">
            <Input id="locationName" name="locationName" defaultValue={site?.locationName ?? ""} placeholder="2F 浴室 など" />
          </Field>
          {/* 体制（自社担当部署/現場責任者/営業担当）は非表示。DBフィールドは将来用に保持 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="着工予定日" htmlFor="plannedStartDate">
              <Input id="plannedStartDate" name="plannedStartDate" type="date" defaultValue={toDateInputValue(site?.plannedStartDate)} />
            </Field>
            <Field label="完工予定日" htmlFor="plannedEndDate">
              <Input id="plannedEndDate" name="plannedEndDate" type="date" defaultValue={toDateInputValue(site?.plannedEndDate)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="着工実績日" htmlFor="actualStartDate">
              <Input id="actualStartDate" name="actualStartDate" type="date" defaultValue={toDateInputValue(site?.actualStartDate)} />
            </Field>
            <Field label="完工実績日" htmlFor="actualEndDate">
              <Input id="actualEndDate" name="actualEndDate" type="date" defaultValue={toDateInputValue(site?.actualEndDate)} />
            </Field>
          </div>
          <Field label="引き継ぎ事項" htmlFor="handoverNote" hint="（前回状況・注意点・残作業）" className="sm:col-span-2">
            <Textarea id="handoverNote" name="handoverNote" defaultValue={site?.handoverNote ?? ""} />
          </Field>
          <Field label="請求ステータス" htmlFor="billingStatus" hint="（将来フェーズ）" className="sm:col-span-2">
            <Select id="billingStatus" name="billingStatus" defaultValue={site?.billingStatus ?? ""}>
              <option value="">未設定</option>
              {BILLING_STATUSES.map((b) => (
                <option key={b} value={b}>
                  {BILLING_STATUS_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>
          {/* 旧キーBOXメモ（v0.3 以前の keybox フィールド）は表示のみ。編集・移行はしない */}
          {site?.keybox && (
            <div className="rounded-xl bg-surface-sunken px-3.5 py-3 sm:col-span-2">
              <p className="text-xs font-semibold text-ink-muted">旧キーBOXメモ（表示のみ）</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{site.keybox}</p>
            </div>
          )}
        </div>
      </details>
      </>
      )}

      {(clientError || state.error) && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {clientError || state.error}
        </div>
      )}

      <SubmitButton isEdit={isEdit} />
    </form>

    {/* 受注済 → 現調に戻す（進行中の現場のみ・管理者のみ・フォーム外）。
        入力済みの情報は消さずに区分だけを戻す。 */}
    {isEdit && site && admin && site.siteStatus === "ACTIVE" && (
      <SiteBackToSurvey siteId={site.id} />
    )}

    {/* 危険操作ゾーン（編集時のみ・フォーム外） */}
    {isEdit && site && <DeleteSiteButton siteId={site.id} siteName={site.name} />}

    {/* 必須未充足時の確認：OK で仮登録保存、キャンセルで入力に戻る */}
    <ConfirmDialog
      open={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      danger
      title="⚠ 仮登録として保存します"
      description={
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">
              <b className="font-bold">必須項目が未入力です。</b>
              このまま保存すると<b className="font-bold">仮登録</b>になり、
              あとで本登録（必須項目の入力）が必要です。
            </p>
          </div>
          <p className="text-sm text-ink-soft">
            入力を続ける場合は「入力に戻る」を選んでください。
          </p>
        </div>
      }
      confirmLabel="仮登録で保存"
      cancelLabel="入力に戻る"
      onConfirm={() => {
        bypassRef.current = true;
        formRef.current?.requestSubmit();
      }}
    />
    </div>
  );
}
