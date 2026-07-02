"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// 空文字を null に正規化
function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export type CustomerFormState = { error?: string };

const customerSchema = z.object({
  name: z.string().trim().min(1, "会社名を入力してください"),
  corporateNumber: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  industry: z.string().nullable(),
  capitalScale: z.string().nullable(),
  registrationType: z.enum(["PRIME", "SUBCONTRACTOR", "OWNER"]),
  tradeStatus: z.enum(["NEW", "CONTINUING", "SUSPENDED"]),
  firstTradeDate: z.string().nullable(),
  headOfficeAddress: z.string().nullable(),
  billingAddress: z.string().nullable(),
  closingDay: z.string().nullable(),
  paymentDueTerm: z.string().nullable(),
  paymentMethod: z.enum(["BANK", "NOTE", "DENSAI"]).nullable(),
  feeBearer: z.string().nullable(),
  memo: z.string().nullable(),
});

function parseCustomer(formData: FormData) {
  const pm = nz(formData.get("paymentMethod"));
  return customerSchema.safeParse({
    name: formData.get("name") ?? "",
    corporateNumber: nz(formData.get("corporateNumber")),
    invoiceNumber: nz(formData.get("invoiceNumber")),
    industry: nz(formData.get("industry")),
    capitalScale: nz(formData.get("capitalScale")),
    registrationType: formData.get("registrationType") || "PRIME",
    tradeStatus: formData.get("tradeStatus") || "NEW",
    firstTradeDate: nz(formData.get("firstTradeDate")),
    headOfficeAddress: nz(formData.get("headOfficeAddress")),
    billingAddress: nz(formData.get("billingAddress")),
    closingDay: nz(formData.get("closingDay")),
    paymentDueTerm: nz(formData.get("paymentDueTerm")),
    paymentMethod: pm as "BANK" | "NOTE" | "DENSAI" | null,
    feeBearer: nz(formData.get("feeBearer")),
    memo: nz(formData.get("memo")),
  });
}

export async function createCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireAdmin();
  const parsed = parseCustomer(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "入力エラー" };
  }
  const d = parsed.data;
  const customer = await db.customer.create({
    data: {
      name: d.name,
      corporateNumber: d.corporateNumber,
      invoiceNumber: d.invoiceNumber,
      industry: d.industry,
      capitalScale: d.capitalScale,
      registrationType: d.registrationType,
      tradeStatus: d.tradeStatus,
      firstTradeDate: d.firstTradeDate ? new Date(d.firstTradeDate) : null,
      headOfficeAddress: d.headOfficeAddress,
      billingAddress: d.billingAddress,
      closingDay: d.closingDay,
      paymentDueTerm: d.paymentDueTerm,
      paymentMethod: d.paymentMethod,
      feeBearer: d.feeBearer,
      memo: d.memo,
    },
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${customer.id}`);
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { error: "顧客が見つかりません" };
  }
  const parsed = parseCustomer(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "入力エラー" };
  }
  const d = parsed.data;
  await db.customer.update({
    where: { id },
    data: {
      name: d.name,
      corporateNumber: d.corporateNumber,
      invoiceNumber: d.invoiceNumber,
      industry: d.industry,
      capitalScale: d.capitalScale,
      registrationType: d.registrationType,
      tradeStatus: d.tradeStatus,
      firstTradeDate: d.firstTradeDate ? new Date(d.firstTradeDate) : null,
      headOfficeAddress: d.headOfficeAddress,
      billingAddress: d.billingAddress,
      closingDay: d.closingDay,
      paymentDueTerm: d.paymentDueTerm,
      paymentMethod: d.paymentMethod,
      feeBearer: d.feeBearer,
      memo: d.memo,
    },
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

const contactSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().trim().min(1, "担当者名を入力してください"),
  department: z.string().nullable(),
  position: z.string().nullable(),
  phone: z.string().nullable(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  contactType: z.enum(["SITE", "ACCOUNTING", "APPROVER"]),
  note: z.string().nullable(),
});

export async function addContact(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = contactSchema.safeParse({
    customerId: formData.get("customerId") ?? "",
    name: formData.get("name") ?? "",
    department: nz(formData.get("department")),
    position: nz(formData.get("position")),
    phone: nz(formData.get("phone")),
    mobile: nz(formData.get("mobile")),
    email: nz(formData.get("email")),
    contactType: formData.get("contactType") || "SITE",
    note: nz(formData.get("note")),
  });
  // 担当者名は必須（フォーム側 required）。検証失敗時は無処理で返す。
  if (!parsed.success) return;
  const d = parsed.data;
  await db.contactPerson.create({
    data: {
      customerId: d.customerId,
      name: d.name,
      department: d.department,
      position: d.position,
      phone: d.phone,
      mobile: d.mobile,
      email: d.email,
      contactType: d.contactType,
      isActive: true,
      activeFrom: new Date(),
      note: d.note,
    },
  });
  revalidatePath(`/customers/${d.customerId}`);
}

// 異動・退任：履歴を残すため削除せず無効化する
export async function setContactInactive(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const contact = await db.contactPerson.update({
    where: { id },
    data: { isActive: false, activeTo: new Date() },
    select: { customerId: true },
  });
  revalidatePath(`/customers/${contact.customerId}`);
}

export async function deleteCustomer(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "顧客が見つかりません" };
  // 紐づく現場が1件以上ある場合は削除不可（先に現場を整理する）
  const siteCount = await db.site.count({ where: { customerId: id } });
  if (siteCount > 0) {
    return { error: `紐づく現場が ${siteCount} 件あるため削除できません` };
  }
  await db.customer.delete({ where: { id } });
  revalidatePath("/customers");
  redirect("/customers");
}
