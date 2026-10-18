import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dateFromKey, storedDateKey } from "@/lib/date";

// 給与・原価単価（StaffPayRate）のフォーム解釈と保存。権限チェックは呼び出し側（server action）で行う。
// ※ "use server" ファイルに置くと公開エンドポイントになるため、ここに分けている。

const yen = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label}は数字で入力してください` })
    .int(`${label}は円単位の整数で入力してください`)
    .min(0, `${label}は0以上で入力してください`)
    .max(100_000_000, `${label}が大きすぎます`);

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "適用開始日を入力してください")
  // 2026-02-30 などは new Date が翌月に繰り越すため、往復して一致するかで弾く
  .refine((k) => storedDateKey(dateFromKey(k)) === k, "適用開始日が正しくありません");

const rateSchema = z.discriminatedUnion("payType", [
  // 月給：基本給は必須、社保（会社負担）・賞与の月割り・その他は任意。月単位で適用（その月の1日で保存）
  z.object({
    payType: z.literal("MONTHLY"),
    payAmount: yen("基本給"),
    socialInsurance: yen("社会保険料").optional(),
    bonusMonthly: yen("賞与の月割り").optional(),
    otherCost: yen("その他の会社負担費用").optional(),
    effectiveFrom: dateKey,
  }),
  z.object({ payType: z.literal("DAILY"), payAmount: yen("日当"), effectiveFrom: dateKey }),
  z.object({ payType: z.literal("HOURLY"), payAmount: yen("時給"), effectiveFrom: dateKey }),
]);

export type PayRateInput = z.infer<typeof rateSchema>;

function digits(v: FormDataEntryValue | null): string | undefined {
  // 「250,000」「２５００００」などの入力も受ける
  const s = typeof v === "string" ? v.normalize("NFKC").replace(/[,\s円]/g, "") : "";
  return s === "" ? undefined : s;
}

const PAY_AMOUNT_LABEL: Record<string, string> = { MONTHLY: "基本給", DAILY: "日当", HOURLY: "時給" };

/** フォームから単価を読む。金額欄がすべて空なら null（＝入力なし） */
export function parsePayRate(
  formData: FormData,
): { data: PayRateInput | null; error?: string } {
  const payType = (formData.get("payType") ?? "").toString();
  if (!(payType in PAY_AMOUNT_LABEL)) return { data: null, error: "給与形態を選んでください" };
  const monthly = payType === "MONTHLY";
  const payAmount = digits(formData.get("payAmount"));
  const extras = monthly
    ? {
        socialInsurance: digits(formData.get("socialInsurance")),
        bonusMonthly: digits(formData.get("bonusMonthly")),
        otherCost: digits(formData.get("otherCost")),
      }
    : {};
  if (payAmount === undefined && Object.values(extras).every((v) => v === undefined)) {
    return { data: null };
  }
  if (payAmount === undefined) {
    return { data: null, error: `${PAY_AMOUNT_LABEL[payType]}を入力してください` };
  }
  // 月給は「◯年◯月から」（type=month の YYYY-MM）→ その月の1日
  const month = (formData.get("effectiveMonth") ?? "").toString();
  const effectiveFrom = monthly
    ? /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : ""
    : (formData.get("effectiveFrom") ?? "").toString();
  const parsed = rateSchema.safeParse({ payType, payAmount, ...extras, effectiveFrom });
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message;
    return { data: null, error: monthly && !effectiveFrom ? "適用開始月を入力してください" : msg };
  }
  return { data: parsed.data };
}

export async function upsertPayRate(
  userId: string,
  d: PayRateInput,
  client: Prisma.TransactionClient = db,
) {
  const effectiveFrom = dateFromKey(d.effectiveFrom);
  const monthly = d.payType === "MONTHLY" ? d : null;
  const values = {
    payType: d.payType,
    payAmount: d.payAmount,
    socialInsurance: monthly?.socialInsurance ?? null,
    bonusMonthly: monthly?.bonusMonthly ?? null,
    otherCost: monthly?.otherCost ?? null,
    costUnitPrice: null, // 旧・手入力の原価単価は使わない（計算で出す）
  };
  await client.staffPayRate.upsert({
    where: { userId_effectiveFrom: { userId, effectiveFrom } },
    update: values,
    create: { userId, effectiveFrom, ...values },
  });
}
