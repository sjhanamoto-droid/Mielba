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

const rateSchema = z.object({
  payType: z.enum(["MONTHLY", "DAILY", "HOURLY"], { message: "給与形態を選んでください" }),
  payAmount: yen("給与額").optional(),
  costUnitPrice: yen("原価単価"),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "適用開始日を入力してください")
    // 2026-02-30 などは new Date が翌月に繰り越すため、往復して一致するかで弾く
    .refine((k) => storedDateKey(dateFromKey(k)) === k, "適用開始日が正しくありません"),
});

export type PayRateInput = z.infer<typeof rateSchema>;

function digits(v: FormDataEntryValue | null): string | undefined {
  // 「250,000」「２５００００」などの入力も受ける
  const s = typeof v === "string" ? v.normalize("NFKC").replace(/[,\s円]/g, "") : "";
  return s === "" ? undefined : s;
}

/** フォームから単価を読む。原価単価・給与額がどちらも空なら null（＝入力なし） */
export function parsePayRate(
  formData: FormData,
): { data: PayRateInput | null; error?: string } {
  const costUnitPrice = digits(formData.get("costUnitPrice"));
  const payAmount = digits(formData.get("payAmount"));
  if (costUnitPrice === undefined && payAmount === undefined) return { data: null };
  if (costUnitPrice === undefined) return { data: null, error: "原価単価を入力してください" };
  const parsed = rateSchema.safeParse({
    payType: formData.get("payType"),
    payAmount,
    costUnitPrice,
    effectiveFrom: (formData.get("effectiveFrom") ?? "").toString(),
  });
  if (!parsed.success) return { data: null, error: parsed.error.errors[0]?.message };
  return { data: parsed.data };
}

export async function upsertPayRate(
  userId: string,
  d: PayRateInput,
  client: Prisma.TransactionClient = db,
) {
  const effectiveFrom = dateFromKey(d.effectiveFrom);
  const values = {
    payType: d.payType,
    payAmount: d.payAmount ?? null,
    costUnitPrice: d.costUnitPrice,
  };
  await client.staffPayRate.upsert({
    where: { userId_effectiveFrom: { userId, effectiveFrom } },
    update: values,
    create: { userId, effectiveFrom, ...values },
  });
}

