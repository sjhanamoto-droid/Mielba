"use client";

import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import {
  PAY_TYPE_LABEL,
  PAY_TYPE_OPTIONS,
  defaultPayTypeForRole,
  employmentLabelForRole,
  type PayType,
} from "@/lib/constants";

// 給与形態・給与額・原価単価・適用開始日の入力欄（スタッフ追加フォームと単価履歴フォームで共用）。
// 給与形態は権限に合わせて既定を切り替える（社員＝月給／アルバイト＝日当）。手で選び直した後は追従しない。
export function PayRateFields({
  role,
  todayKey,
}: {
  role: string;
  todayKey: string;
}) {
  const [payType, setPayType] = useState<PayType>(defaultPayTypeForRole(role));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setPayType(defaultPayTypeForRole(role));
  }, [role, touched]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="給与形態"
        htmlFor="payType"
        required
        description={`区分：${employmentLabelForRole(role)}（権限で切り替わります）`}
      >
        <Select
          id="payType"
          name="payType"
          value={payType}
          onChange={(e) => {
            setTouched(true);
            setPayType(e.target.value as PayType);
          }}
        >
          {PAY_TYPE_OPTIONS.map((p) => (
            <option key={p} value={p}>{PAY_TYPE_LABEL[p]}</option>
          ))}
        </Select>
      </Field>
      <Field label={`${PAY_TYPE_LABEL[payType]}（円）`} htmlFor="payAmount" hint="任意">
        <Input
          id="payAmount"
          name="payAmount"
          inputMode="numeric"
          placeholder={payType === "MONTHLY" ? "例：280000" : payType === "DAILY" ? "例：12000" : "例：1200"}
        />
      </Field>
      <Field
        label="原価単価（円／人工）"
        htmlFor="costUnitPrice"
        required
        description="現場原価の計算に使う、1人1日あたりの金額です。"
      >
        <Input
          id="costUnitPrice"
          name="costUnitPrice"
          inputMode="numeric"
          placeholder="例：18000"
        />
      </Field>
      <Field
        label="適用開始日"
        htmlFor="effectiveFrom"
        required
        description="この日以降の原価に使います。それより前の日は以前の単価のままです。"
      >
        <Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={todayKey} required />
      </Field>
    </div>
  );
}
