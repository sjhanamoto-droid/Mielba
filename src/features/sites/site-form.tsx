"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle } from "lucide-react";
import { createSite, updateSite } from "./actions";
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
  receivedDate: Date | string | null;
  contractNumber: string | null;
  departmentInCharge: string | null;
  siteManager: string | null;
  salesRep: string | null;
  plannedStartDate: Date | string | null;
  plannedEndDate: Date | string | null;
  actualStartDate: Date | string | null;
  actualEndDate: Date | string | null;
  progressRate: number;
  handoverNote: string | null;
  memo: string | null;
};

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
}: {
  customers: CustomerOption[];
  site?: SiteFormData;
}) {
  const isEdit = !!site;

  const action = async (_prev: FormState, formData: FormData): Promise<FormState> => {
    if (site) {
      return (await updateSite(site.id, formData)) ?? {};
    }
    return (await createSite(formData)) ?? {};
  };

  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {/* 基本情報 */}
      <div className="space-y-3">
        <SectionTitle>基本情報</SectionTitle>
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
          <Field label="案件コード" htmlFor="projectCode">
            <Input id="projectCode" name="projectCode" defaultValue={site?.projectCode ?? ""} />
          </Field>
          <Field label="工事コード" htmlFor="constructionCode">
            <Input id="constructionCode" name="constructionCode" defaultValue={site?.constructionCode ?? ""} />
          </Field>
          <Field label="種別" htmlFor="projectType" className="sm:col-span-2">
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
          <Field label="現場ステータス" htmlFor="siteStatus">
            <Select id="siteStatus" name="siteStatus" defaultValue={site?.siteStatus ?? "SURVEY"}>
              {SITE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SITE_STATUS_LABEL[s]}
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
        </Card>
      </div>

      {/* 場所 */}
      <div className="space-y-3">
        <SectionTitle>場所</SectionTitle>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="住所" htmlFor="address" className="sm:col-span-2">
            <Input id="address" name="address" defaultValue={site?.address ?? ""} placeholder="東京都◯◯区…" />
          </Field>
          <Field label="作業場所名" htmlFor="locationName" className="sm:col-span-2">
            <Input id="locationName" name="locationName" defaultValue={site?.locationName ?? ""} placeholder="2F 浴室 など" />
          </Field>
          <Field label="キーBOX" htmlFor="keybox" hint="（設置場所・解錠情報）">
            <Input id="keybox" name="keybox" defaultValue={site?.keybox ?? ""} />
          </Field>
          <Field label="現場側担当者" htmlFor="siteContactName">
            <Input id="siteContactName" name="siteContactName" defaultValue={site?.siteContactName ?? ""} />
          </Field>
        </Card>
      </div>

      {/* 体制 */}
      <div className="space-y-3">
        <SectionTitle>体制</SectionTitle>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="自社担当部署" htmlFor="departmentInCharge" className="sm:col-span-2">
            <Input id="departmentInCharge" name="departmentInCharge" defaultValue={site?.departmentInCharge ?? ""} />
          </Field>
          <Field label="現場責任者" htmlFor="siteManager">
            <Input id="siteManager" name="siteManager" defaultValue={site?.siteManager ?? ""} />
          </Field>
          <Field label="営業担当" htmlFor="salesRep">
            <Input id="salesRep" name="salesRep" defaultValue={site?.salesRep ?? ""} />
          </Field>
        </Card>
      </div>

      {/* 工程・期間 */}
      <div className="space-y-3">
        <SectionTitle>工程・期間</SectionTitle>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
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
          <Field label="進捗率" htmlFor="progressRate" hint="（0〜100%）" className="sm:col-span-2">
            <Input id="progressRate" name="progressRate" type="number" inputMode="numeric" min={0} max={100} defaultValue={site?.progressRate ?? 0} />
          </Field>
        </Card>
      </div>

      {/* 引き継ぎ・メモ */}
      <div className="space-y-3">
        <SectionTitle>引き継ぎ・メモ</SectionTitle>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
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
        </Card>
      </div>

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <SubmitButton isEdit={isEdit} />
    </form>
  );
}
