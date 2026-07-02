"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle } from "lucide-react";
import {
  createCustomer,
  updateCustomer,
  type CustomerFormState,
} from "./actions";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import {
  REGISTRATION_TYPE_LABEL,
  TRADE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  type RegistrationType,
  type TradeStatus,
  type PaymentMethod,
} from "@/lib/constants";
import { toDateInputValue } from "@/lib/utils";

export type CustomerFormValues = {
  id?: string;
  name?: string | null;
  corporateNumber?: string | null;
  invoiceNumber?: string | null;
  industry?: string | null;
  capitalScale?: string | null;
  registrationType?: string | null;
  tradeStatus?: string | null;
  firstTradeDate?: Date | string | null;
  headOfficeAddress?: string | null;
  billingAddress?: string | null;
  closingDay?: string | null;
  paymentDueTerm?: string | null;
  paymentMethod?: string | null;
  feeBearer?: string | null;
  memo?: string | null;
};

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
          {isEdit ? "変更を保存" : "顧客を登録"}
        </>
      )}
    </button>
  );
}

export function CustomerForm({ customer }: { customer?: CustomerFormValues }) {
  const isEdit = Boolean(customer?.id);
  const action = isEdit ? updateCustomer : createCustomer;
  const [state, formAction] = useActionState<CustomerFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      {isEdit && <input type="hidden" name="id" value={customer?.id} />}

      {/* 基本情報 */}
      <section className="space-y-3">
        <SectionTitle>基本情報</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
        <Field label="会社名" required htmlFor="name" className="sm:col-span-2">
          <Input
            id="name"
            name="name"
            defaultValue={customer?.name ?? ""}
            placeholder="株式会社○○建設"
            required
          />
        </Field>
        <Field label="法人番号" hint="13桁" htmlFor="corporateNumber">
          <Input
            id="corporateNumber"
            name="corporateNumber"
            inputMode="numeric"
            defaultValue={customer?.corporateNumber ?? ""}
            placeholder="1234567890123"
          />
        </Field>
        <Field label="インボイス登録番号" hint="T+13桁" htmlFor="invoiceNumber">
          <Input
            id="invoiceNumber"
            name="invoiceNumber"
            defaultValue={customer?.invoiceNumber ?? ""}
            placeholder="T1234567890123"
          />
        </Field>
        <Field label="業種" htmlFor="industry">
          <Input
            id="industry"
            name="industry"
            defaultValue={customer?.industry ?? ""}
            placeholder="総合建設業"
          />
        </Field>
        <Field label="資本金規模" htmlFor="capitalScale">
          <Input
            id="capitalScale"
            name="capitalScale"
            defaultValue={customer?.capitalScale ?? ""}
            placeholder="1,000万円〜5,000万円"
          />
        </Field>
        <Field label="登録区分" required htmlFor="registrationType">
          <Select
            id="registrationType"
            name="registrationType"
            defaultValue={customer?.registrationType ?? "PRIME"}
          >
            {(Object.keys(REGISTRATION_TYPE_LABEL) as RegistrationType[]).map(
              (k) => (
                <option key={k} value={k}>
                  {REGISTRATION_TYPE_LABEL[k]}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label="取引ステータス" required htmlFor="tradeStatus">
          <Select
            id="tradeStatus"
            name="tradeStatus"
            defaultValue={customer?.tradeStatus ?? "NEW"}
          >
            {(Object.keys(TRADE_STATUS_LABEL) as TradeStatus[]).map((k) => (
              <option key={k} value={k}>
                {TRADE_STATUS_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="初回取引日" htmlFor="firstTradeDate">
          <Input
            id="firstTradeDate"
            name="firstTradeDate"
            type="date"
            defaultValue={toDateInputValue(customer?.firstTradeDate)}
          />
        </Field>
        </div>
      </section>

      {/* 住所 */}
      <section className="space-y-3">
        <SectionTitle>住所</SectionTitle>
        <Field label="本社住所" htmlFor="headOfficeAddress">
          <Textarea
            id="headOfficeAddress"
            name="headOfficeAddress"
            defaultValue={customer?.headOfficeAddress ?? ""}
            placeholder="東京都○○区..."
          />
        </Field>
        <Field
          label="請求書送付先住所"
          hint="本社と異なる場合"
          htmlFor="billingAddress"
        >
          <Textarea
            id="billingAddress"
            name="billingAddress"
            defaultValue={customer?.billingAddress ?? ""}
            placeholder="本社と同じ場合は空欄"
          />
        </Field>
      </section>

      {/* 入金・請求条件 */}
      <section className="space-y-3">
        <SectionTitle>入金・請求条件</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
        <Field label="締め日" htmlFor="closingDay">
          <Input
            id="closingDay"
            name="closingDay"
            defaultValue={customer?.closingDay ?? ""}
            placeholder="末締め"
          />
        </Field>
        <Field label="支払期日" htmlFor="paymentDueTerm">
          <Input
            id="paymentDueTerm"
            name="paymentDueTerm"
            defaultValue={customer?.paymentDueTerm ?? ""}
            placeholder="翌月末払い"
          />
        </Field>
        <Field label="支払方法" htmlFor="paymentMethod">
          <Select
            id="paymentMethod"
            name="paymentMethod"
            defaultValue={customer?.paymentMethod ?? ""}
          >
            <option value="">未設定</option>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
              <option key={k} value={k}>
                {PAYMENT_METHOD_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="振込手数料の負担区分" htmlFor="feeBearer">
          <Input
            id="feeBearer"
            name="feeBearer"
            defaultValue={customer?.feeBearer ?? ""}
            placeholder="先方負担 / 当方負担"
          />
        </Field>
        </div>
      </section>

      {/* メモ */}
      <section className="space-y-3">
        <SectionTitle>メモ</SectionTitle>
        <Field label="メモ" htmlFor="memo">
          <Textarea
            id="memo"
            name="memo"
            defaultValue={customer?.memo ?? ""}
            placeholder="特記事項など"
          />
        </Field>
      </section>

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
