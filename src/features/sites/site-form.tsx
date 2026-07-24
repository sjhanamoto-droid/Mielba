"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle, ChevronDown, KeyRound, FileText, CalendarRange } from "lucide-react";
import { createSite, updateSite } from "./actions";
import { SitePhotoField, type SitePhotoInit } from "./site-photo-field";
import { DeleteSiteButton } from "./delete-site-button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { toDateInputValue } from "@/lib/utils";
import {
  PROJECT_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  SITE_STATUS_LABEL,
  BILLING_STATUS_LABEL,
  type ProjectType,
  type SiteStatus,
  type BillingStatus,
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
  keyboxNumber: string | null;
  keyboxPlace: string | null;
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
  memo: string | null;
};

/** 現場に直付けされた既存写真（kind ごとにアップローダーへ渡す） */
export type SiteFormPhoto = SitePhotoInit & { kind: string };

type FormState = { error?: string };

const PROJECT_TYPES: ProjectType[] = ["REFORM", "RENOVATION", "NEWBUILD", "MAINTENANCE"];
const SITE_STATUSES: SiteStatus[] = ["SURVEY", "ACTIVE", "PAST"];
const BILLING_STATUSES: BillingStatus[] = ["UNBILLED", "BILLED", "PARTIAL", "PAID"];

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
}: {
  customers: CustomerOption[];
  site?: SiteFormData;
  sitePhotos?: SiteFormPhoto[];
}) {
  const isEdit = !!site;

  const action = async (_prev: FormState, formData: FormData): Promise<FormState> => {
    if (site) {
      return (await updateSite(site.id, formData)) ?? {};
    }
    return (await createSite(formData)) ?? {};
  };

  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  const keyboxPhotos = sitePhotos.filter((p) => p.kind === "KEYBOX");
  const drawingPhotos = sitePhotos.filter((p) => p.kind === "DRAWING");
  const schedulePhotos = sitePhotos.filter((p) => p.kind === "SCHEDULE");

  return (
    <div className="space-y-4">
    <form action={formAction} className="space-y-4">
      {/* 基本 */}
      <div className="space-y-3">
        <SectionTitle>基本</SectionTitle>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
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
          <Field label="場所（住所）" htmlFor="address" className="sm:col-span-2">
            <Input id="address" name="address" defaultValue={site?.address ?? ""} placeholder="東京都◯◯区…" />
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

      {/* 現場入り情報 */}
      <div className="space-y-3">
        <SectionTitle>現場入り情報</SectionTitle>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="キーBOX番号" htmlFor="keyboxNumber">
            <Input id="keyboxNumber" name="keyboxNumber" defaultValue={site?.keyboxNumber ?? ""} placeholder="1234" />
          </Field>
          <Field label="キーBOX場所" htmlFor="keyboxPlace">
            <Input id="keyboxPlace" name="keyboxPlace" defaultValue={site?.keyboxPlace ?? ""} placeholder="玄関脇のガスメーター横" />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
              <KeyRound className="h-4 w-4 text-ink-muted" />
              キーBOXの写真
            </p>
            <SitePhotoField name="keyboxPhotos" kind="KEYBOX" initial={keyboxPhotos} />
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
            </p>
            <SitePhotoField name="drawingPhotos" kind="DRAWING" allowPdf initial={drawingPhotos} buttonLabel="図面を追加" />
          </div>
          <div className="border-t border-line pt-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
              <CalendarRange className="h-4 w-4 text-ink-muted" />
              工程表 <span className="font-normal text-ink-faint">（画像・PDF可）</span>
            </p>
            <SitePhotoField name="schedulePhotos" kind="SCHEDULE" allowPdf initial={schedulePhotos} buttonLabel="工程表を追加" />
          </div>
        </Card>
      </div>

      {/* 管理 */}
      <div className="space-y-3">
        <SectionTitle>管理</SectionTitle>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
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
          <Field label="現場ステータス" htmlFor="siteStatus" className="sm:col-span-2">
            <Select id="siteStatus" name="siteStatus" defaultValue={site?.siteStatus ?? "SURVEY"}>
              {SITE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SITE_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      </div>

      {/* 詳細設定（折りたたみ） */}
      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-ink-soft [&::-webkit-details-marker]:hidden">
          詳細設定
          <ChevronDown className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
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
          <Field label="案件ステータス" htmlFor="projectStatus">
            <Select id="projectStatus" name="projectStatus" defaultValue={site?.projectStatus ?? "ESTIMATING"}>
              {PROJECT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
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
          <Field label="自社担当部署" htmlFor="departmentInCharge" className="sm:col-span-2">
            <Input id="departmentInCharge" name="departmentInCharge" defaultValue={site?.departmentInCharge ?? ""} />
          </Field>
          <Field label="現場責任者" htmlFor="siteManager">
            <Input id="siteManager" name="siteManager" defaultValue={site?.siteManager ?? ""} />
          </Field>
          <Field label="営業担当" htmlFor="salesRep">
            <Input id="salesRep" name="salesRep" defaultValue={site?.salesRep ?? ""} />
          </Field>
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
          <Field label="メモ" htmlFor="memo" className="sm:col-span-2">
            <Textarea id="memo" name="memo" defaultValue={site?.memo ?? ""} />
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

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <SubmitButton isEdit={isEdit} />
    </form>

    {/* 危険操作ゾーン（編集時のみ・フォーム外） */}
    {isEdit && site && <DeleteSiteButton siteId={site.id} siteName={site.name} />}
    </div>
  );
}
