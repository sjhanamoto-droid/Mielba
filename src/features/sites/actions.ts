"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// ── 区分の許容値（@/lib/constants の型に対応） ──
const PROJECT_TYPES = ["REFORM", "RENOVATION", "NEWBUILD", "MAINTENANCE"] as const;
const PROJECT_STATUSES = [
  "ESTIMATING",
  "ORDERED",
  "STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
] as const;
const SITE_STATUSES = ["SURVEY", "ACTIVE", "PAST"] as const;
const BILLING_STATUSES = ["UNBILLED", "BILLED", "PARTIAL", "PAID"] as const;

// 空文字 → undefined（任意文字列）
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

// 空文字 → undefined（任意日付文字列）
const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

const siteSchema = z.object({
  customerId: z.string().min(1, "元請企業を選択してください"),
  name: z.string().min(1, "案件名を入力してください"),
  projectCode: optionalText,
  constructionCode: optionalText,
  projectType: z.enum(PROJECT_TYPES),
  projectStatus: z.enum(PROJECT_STATUSES),
  siteStatus: z.enum(SITE_STATUSES),
  billingStatus: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(BILLING_STATUSES).optional(),
  ),
  locationName: optionalText,
  address: optionalText,
  keybox: optionalText,
  siteContactName: optionalText,
  receivedDate: optionalDate,
  contractNumber: optionalText,
  departmentInCharge: optionalText,
  siteManager: optionalText,
  salesRep: optionalText,
  plannedStartDate: optionalDate,
  plannedEndDate: optionalDate,
  actualStartDate: optionalDate,
  actualEndDate: optionalDate,
  progressRate: z.coerce.number().int().min(0).max(100).default(0),
  handoverNote: optionalText,
  memo: optionalText,
});

function toDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSiteForm(formData: FormData) {
  return siteSchema.safeParse({
    customerId: formData.get("customerId"),
    name: formData.get("name"),
    projectCode: formData.get("projectCode"),
    constructionCode: formData.get("constructionCode"),
    projectType: formData.get("projectType"),
    projectStatus: formData.get("projectStatus"),
    siteStatus: formData.get("siteStatus"),
    billingStatus: formData.get("billingStatus"),
    locationName: formData.get("locationName"),
    address: formData.get("address"),
    keybox: formData.get("keybox"),
    siteContactName: formData.get("siteContactName"),
    receivedDate: formData.get("receivedDate"),
    contractNumber: formData.get("contractNumber"),
    departmentInCharge: formData.get("departmentInCharge"),
    siteManager: formData.get("siteManager"),
    salesRep: formData.get("salesRep"),
    plannedStartDate: formData.get("plannedStartDate"),
    plannedEndDate: formData.get("plannedEndDate"),
    actualStartDate: formData.get("actualStartDate"),
    actualEndDate: formData.get("actualEndDate"),
    progressRate: formData.get("progressRate") ?? 0,
    handoverNote: formData.get("handoverNote"),
    memo: formData.get("memo"),
  });
}

// data 形（create / update 共通）
function toData(d: z.infer<typeof siteSchema>) {
  return {
    customerId: d.customerId,
    name: d.name,
    projectCode: d.projectCode ?? null,
    constructionCode: d.constructionCode ?? null,
    projectType: d.projectType,
    projectStatus: d.projectStatus,
    siteStatus: d.siteStatus,
    billingStatus: d.billingStatus ?? null,
    locationName: d.locationName ?? null,
    address: d.address ?? null,
    keybox: d.keybox ?? null,
    siteContactName: d.siteContactName ?? null,
    receivedDate: toDate(d.receivedDate),
    contractNumber: d.contractNumber ?? null,
    departmentInCharge: d.departmentInCharge ?? null,
    siteManager: d.siteManager ?? null,
    salesRep: d.salesRep ?? null,
    plannedStartDate: toDate(d.plannedStartDate),
    plannedEndDate: toDate(d.plannedEndDate),
    actualStartDate: toDate(d.actualStartDate),
    actualEndDate: toDate(d.actualEndDate),
    progressRate: d.progressRate,
    handoverNote: d.handoverNote ?? null,
    memo: d.memo ?? null,
  };
}

export async function createSite(formData: FormData) {
  await requireAdmin();
  const parsed = parseSiteForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const site = await db.site.create({ data: toData(parsed.data) });
  revalidatePath("/sites");
  revalidatePath("/");
  revalidatePath(`/customers/${site.customerId}`);
  redirect(`/sites/${site.id}`);
}

export async function updateSite(siteId: string, formData: FormData) {
  await requireAdmin();
  const parsed = parseSiteForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const site = await db.site.update({ where: { id: siteId }, data: toData(parsed.data) });
  revalidatePath("/sites");
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/");
  revalidatePath(`/customers/${site.customerId}`);
  redirect(`/sites/${site.id}`);
}

// ── ステータス変更（SURVEY / ACTIVE / PAST） ──
export async function changeSiteStatus(siteId: string, status: string) {
  await requireAdmin();
  if (!SITE_STATUSES.includes(status as (typeof SITE_STATUSES)[number])) return;
  const current = await db.site.findUnique({
    where: { id: siteId },
    select: { siteStatus: true },
  });
  await db.site.update({ where: { id: siteId }, data: { siteStatus: status } });

  // 現調→進行中の再入力不要（§4.2.8 フローB）: 引き継ぎ時に住所/キーBOX を Survey から補完
  if (current?.siteStatus === "SURVEY" && status === "ACTIVE") {
    const survey = await db.survey.findUnique({
      where: { siteId },
      select: { address: true, keybox: true },
    });
    if (survey) {
      await backfillSiteFromSurvey(siteId, survey.address ?? null, survey.keybox ?? null);
    }
  }

  revalidatePath("/sites");
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/");
}

// ── 現調（Survey）の upsert ──
const surveySchema = z.object({
  address: optionalText,
  keybox: optionalText,
  situationMemo: optionalText,
  relatedNote: optionalText,
});

// 現調写真（reports/actions.ts の writeNested と同等）
const surveyPhotoSchema = z.object({
  dataUrl: z.string().min(1),
  caption: z.string().optional().nullable(),
  kind: z.string().optional().nullable(),
  isVideo: z.boolean().optional(),
  width: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
});

function parseJson<T>(value: FormDataEntryValue | null): T[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? (arr as T[]) : [];
  } catch {
    return [];
  }
}

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function saveSurvey(siteId: string, formData: FormData) {
  await requireAdmin();
  const parsed = surveySchema.safeParse({
    address: formData.get("address"),
    keybox: formData.get("keybox"),
    situationMemo: formData.get("situationMemo"),
    relatedNote: formData.get("relatedNote"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const d = parsed.data;
  const data = {
    address: d.address ?? null,
    keybox: d.keybox ?? null,
    situationMemo: d.situationMemo ?? null,
    relatedNote: d.relatedNote ?? null,
  };
  const survey = await db.survey.upsert({
    where: { siteId },
    create: { siteId, surveyedAt: new Date(), ...data },
    update: data,
  });

  // 現調写真の保存（hidden JSON → 作り直し）
  const photos = parseJson<z.infer<typeof surveyPhotoSchema>>(formData.get("photos")).filter(
    (p) => p && typeof p.dataUrl === "string" && p.dataUrl !== "",
  );
  await db.photo.deleteMany({ where: { surveyId: survey.id } });
  if (photos.length > 0) {
    await db.photo.createMany({
      data: photos.map((p) => ({
        surveyId: survey.id,
        reportId: null,
        dataUrl: p.dataUrl,
        caption: clean(p.caption),
        kind: clean(p.kind) ?? "SURVEY",
        isVideo: Boolean(p.isVideo),
        width: typeof p.width === "number" ? p.width : null,
        height: typeof p.height === "number" ? p.height : null,
      })),
    });
  }

  // 現調→進行中の再入力不要（§4.2.8 フローB）: Site の住所/キーBOX が未設定なら補完
  await backfillSiteFromSurvey(siteId, d.address ?? null, d.keybox ?? null);

  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/survey`);
  return { ok: true };
}

// Site.address/keybox が未設定(null/空)なら Survey 値で補完（既存値は上書きしない）
async function backfillSiteFromSurvey(
  siteId: string,
  surveyAddress: string | null,
  surveyKeybox: string | null,
) {
  if (!surveyAddress && !surveyKeybox) return;
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { address: true, keybox: true },
  });
  if (!site) return;
  const patch: { address?: string; keybox?: string } = {};
  if (!clean(site.address) && surveyAddress) patch.address = surveyAddress;
  if (!clean(site.keybox) && surveyKeybox) patch.keybox = surveyKeybox;
  if (Object.keys(patch).length > 0) {
    await db.site.update({ where: { id: siteId }, data: patch });
  }
}

// ── 職人割当 ──
function revalidateAssignment(siteId: string) {
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/sites");
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/todos");
}

export async function assignUser(siteId: string, userId: string) {
  await requireAdmin();
  if (!siteId || !userId) return;
  await db.siteAssignment.upsert({
    where: { siteId_userId: { siteId, userId } },
    create: { siteId, userId },
    update: {},
  });
  revalidateAssignment(siteId);
}

export async function unassignUser(siteId: string, userId: string) {
  await requireAdmin();
  if (!siteId || !userId) return;
  await db.siteAssignment
    .delete({ where: { siteId_userId: { siteId, userId } } })
    .catch(() => undefined);
  revalidateAssignment(siteId);
}

// ── 関連現場（同一住所）リンク ──
export async function addRelatedSite(siteId: string, otherSiteId: string, note?: string) {
  await requireAdmin();
  if (!siteId || !otherSiteId || siteId === otherSiteId) return;
  // 既存（どちら向き）を確認し、なければ作成
  const existing = await db.siteRelation.findFirst({
    where: {
      OR: [
        { siteAId: siteId, siteBId: otherSiteId },
        { siteAId: otherSiteId, siteBId: siteId },
      ],
    },
    select: { id: true },
  });
  if (!existing) {
    await db.siteRelation.create({
      data: { siteAId: siteId, siteBId: otherSiteId, note: note?.trim() || null },
    });
  }
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${otherSiteId}`);
}

export async function removeRelation(relationId: string, siteId: string) {
  await requireAdmin();
  if (!relationId) return;
  await db.siteRelation.delete({ where: { id: relationId } }).catch(() => undefined);
  revalidatePath(`/sites/${siteId}`);
}

// ── 協力会社（SitePartner） ──
const partnerSchema = z.object({
  name: z.string().min(1, "協力会社名を入力してください"),
  role: optionalText,
  contact: optionalText,
});

export async function addSitePartner(siteId: string, formData: FormData) {
  await requireAdmin();
  if (!siteId) return { error: "現場が指定されていません" };
  const parsed = partnerSchema.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
    contact: formData.get("contact"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const d = parsed.data;
  await db.sitePartner.create({
    data: {
      siteId,
      name: d.name,
      role: d.role ?? null,
      contact: d.contact ?? null,
    },
  });
  revalidatePath(`/sites/${siteId}`);
  return { ok: true };
}

export async function removeSitePartner(id: string) {
  await requireAdmin();
  if (!id) return;
  const partner = await db.sitePartner
    .delete({ where: { id }, select: { siteId: true } })
    .catch(() => null);
  if (partner) revalidatePath(`/sites/${partner.siteId}`);
}
