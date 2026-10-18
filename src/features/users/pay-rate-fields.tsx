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

// 給与形態と金額・適用開始日の入力欄（スタッフ追加フォームと単価履歴フォームで共用）。
// 給与形態は権限に合わせて既定を切り替える（社員＝月給／アルバイト＝日当）。手で選び直した後は追従しない。
// 1人工の原価は入力せず計算で出す（src/lib/labor-cost.ts）。
//   月給 … 月の人件費（基本給＋社保＋賞与月割り＋その他）÷ その月の稼働日数
//   日当 … 日当 ／ 時給 … 時給 × 日報の作業時間

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

function toNum(v: string): number {
  const n = Number(v.normalize("NFKC").replace(/[,\s円]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

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

  // 月給の月額合計（表示用）
  const [monthly, setMonthly] = useState({ payAmount: "", socialInsurance: "", bonusMonthly: "", otherCost: "" });
  const monthlyTotal = Object.values(monthly).reduce((s, v) => s + toNum(v), 0);
  const bind = (key: keyof typeof monthly) => ({
    value: monthly[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMonthly((m) => ({ ...m, [key]: e.target.value })),
  });

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

      {payType === "MONTHLY" ? (
        <>
          <Field
            label="適用開始月"
            htmlFor="effectiveMonth"
            required
            description="この月から使います。それより前の月は以前の金額のままです。"
          >
            <Input id="effectiveMonth" name="effectiveMonth" type="month" defaultValue={todayKey.slice(0, 7)} required />
          </Field>
          <Field label="基本給（円／月）" htmlFor="payAmount" required>
            <Input id="payAmount" name="payAmount" inputMode="numeric" placeholder="例：280000" {...bind("payAmount")} />
          </Field>
          <Field label="社会保険料・会社負担分（円／月）" htmlFor="socialInsurance" hint="任意">
            <Input id="socialInsurance" name="socialInsurance" inputMode="numeric" placeholder="例：42000" {...bind("socialInsurance")} />
          </Field>
          <Field label="賞与の月割り（円／月）" htmlFor="bonusMonthly" hint="任意" description="年間の賞与見込み ÷ 12">
            <Input id="bonusMonthly" name="bonusMonthly" inputMode="numeric" placeholder="例：50000" {...bind("bonusMonthly")} />
          </Field>
          <Field label="その他の会社負担費用（円／月）" htmlFor="otherCost" hint="任意" description="通勤手当・福利厚生など">
            <Input id="otherCost" name="otherCost" inputMode="numeric" placeholder="例：10000" {...bind("otherCost")} />
          </Field>
          <div className="rounded-xl bg-surface-sunken px-3 py-3 text-sm sm:col-span-2">
            <p className="text-ink-muted">
              月の人件費 <span className="font-bold text-ink tnum">{yen(monthlyTotal)}</span>
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              1人工の原価 ＝ 月の人件費 ÷ その月の稼働日数（日報の提出日＋事務所作業の日）。1日に2現場なら半分ずつ配ります。
            </p>
          </div>
        </>
      ) : (
        <>
          <Field
            label="適用開始日"
            htmlFor="effectiveFrom"
            required
            description="この日以降の原価に使います。それより前の日は以前の金額のままです。"
          >
            <Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={todayKey} required />
          </Field>
          <Field
            label={`${PAY_TYPE_LABEL[payType]}（円）`}
            htmlFor="payAmount"
            required
            description={
              payType === "DAILY"
                ? "1日の原価になります。1日に2現場なら半分ずつ配ります。"
                : "時給 × 日報の作業時間（開始〜終了）が原価になります。"
            }
          >
            <Input
              id="payAmount"
              name="payAmount"
              inputMode="numeric"
              placeholder={payType === "DAILY" ? "例：12000" : "例：1200"}
            />
          </Field>
        </>
      )}
    </div>
  );
}
