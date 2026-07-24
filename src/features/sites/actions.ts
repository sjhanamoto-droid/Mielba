"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { parseAndValidatePhotosField, type NewPhotoInput } from "@/lib/photos";

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

// 空文字 → undefined（任意の0以上整数。人工など）
const optionalNonNegInt = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce
    .number({ invalid_type_error: "数値で入力してください" })
    .int("整数で入力してください")
    .min(0, "0以上で入力してください")
    .optional(),
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
  siteContactName: optionalText,
  siteContactPhone: optionalText,
  keyboxNumber: optionalText,
  keyboxPlace: optionalText,
  targetManDays: optionalNonNegInt,
  receivedDate: optionalDate,
  contractNumber: optionalText,
  plannedStartDate: optionalDate,
  plannedEndDate: optionalDate,
  actualStartDate: optionalDate,
  actualEndDate: optionalDate,
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
    siteContactName: formData.get("siteContactName"),
    siteContactPhone: formData.get("siteContactPhone"),
    keyboxNumber: formData.get("keyboxNumber"),
    keyboxPlace: formData.get("keyboxPlace"),
    targetManDays: formData.get("targetManDays"),
    receivedDate: formData.get("receivedDate"),
    contractNumber: formData.get("contractNumber"),
    plannedStartDate: formData.get("plannedStartDate"),
    plannedEndDate: formData.get("plannedEndDate"),
    actualStartDate: formData.get("actualStartDate"),
    actualEndDate: formData.get("actualEndDate"),
    handoverNote: formData.get("handoverNote"),
    memo: formData.get("memo"),
  });
}

// data 形（create / update 共通）
// 注: 旧 keybox フィールドは v0.4 で「旧キーBOXメモ（表示のみ）」となったため、
//     フォームからは更新しない（値は保持される）。
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
    siteContactName: d.siteContactName ?? null,
    siteContactPhone: d.siteContactPhone ?? null,
    keyboxNumber: d.keyboxNumber ?? null,
    keyboxPlace: d.keyboxPlace ?? null,
    targetManDays: d.targetManDays ?? null,
    receivedDate: toDate(d.receivedDate),
    contractNumber: d.contractNumber ?? null,
    plannedStartDate: toDate(d.plannedStartDate),
    plannedEndDate: toDate(d.plannedEndDate),
    actualStartDate: toDate(d.actualStartDate),
    actualEndDate: toDate(d.actualEndDate),
    handoverNote: d.handoverNote ?? null,
    memo: d.memo ?? null,
  };
}

// ── 現場直付け写真（キーBOX / 図面 / 工程表）──
// フォームの hidden JSON（共有契約2の形式）を kind ごとに受け取る。
const SITE_PHOTO_FIELDS = [
  { field: "keyboxPhotos", kind: "KEYBOX" },
  { field: "drawingPhotos", kind: "DRAWING" },
  { field: "schedulePhotos", kind: "SCHEDULE" },
] as const;

type SitePhotoSet = { kind: string; kept: string[]; added: NewPhotoInput[] };

function parseSitePhotoFields(formData: FormData): SitePhotoSet[] | { error: string } {
  const sets: SitePhotoSet[] = [];
  for (const spec of SITE_PHOTO_FIELDS) {
    const raw = formData.get(spec.field);
    const parsed = parseAndValidatePhotosField(typeof raw === "string" ? raw : "");
    if ("error" in parsed) return { error: parsed.error };
    sets.push({ kind: spec.kind, kept: parsed.kept, added: parsed.added });
  }
  return sets;
}

// kind ごとに「kept に無い既存写真を削除 → added を作成」する
async function applySitePhotoSets(
  tx: Prisma.TransactionClient,
  siteId: string,
  sets: SitePhotoSet[],
) {
  for (const set of sets) {
    await tx.photo.deleteMany({
      where: { siteId, kind: set.kind, id: { notIn: set.kept } },
    });
    if (set.added.length > 0) {
      await tx.photo.createMany({
        data: set.added.map((p) => ({
          siteId,
          kind: set.kind, // アップロード欄の kind に固定
          dataUrl: p.dataUrl,
          thumbUrl: p.thumbUrl ?? null,
          caption: p.caption.trim() === "" ? null : p.caption,
          isVideo: p.isVideo,
          width: p.width ?? null,
          height: p.height ?? null,
        })),
      });
    }
  }
}

export async function createSite(formData: FormData) {
  await requireAdmin();
  const parsed = parseSiteForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const photoSets = parseSitePhotoFields(formData);
  if (!Array.isArray(photoSets)) {
    return { error: photoSets.error };
  }

  let siteId: string;
  let customerId: string;
  try {
    const site = await db.$transaction(async (tx) => {
      const created = await tx.site.create({ data: toData(parsed.data) });
      await applySitePhotoSets(tx, created.id, photoSets);
      return created;
    });
    siteId = site.id;
    customerId = site.customerId;
  } catch {
    return { error: "現場の保存に失敗しました。時間をおいて再度お試しください" };
  }

  revalidatePath("/sites");
  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/sites/${siteId}?toast=${encodeURIComponent("保存しました")}`);
}

export async function updateSite(siteId: string, formData: FormData) {
  await requireAdmin();
  const parsed = parseSiteForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const photoSets = parseSitePhotoFields(formData);
  if (!Array.isArray(photoSets)) {
    return { error: photoSets.error };
  }

  let customerId: string;
  try {
    const site = await db.$transaction(async (tx) => {
      const updated = await tx.site.update({
        where: { id: siteId },
        data: toData(parsed.data),
      });
      await applySitePhotoSets(tx, siteId, photoSets);
      return updated;
    });
    customerId = site.customerId;
  } catch {
    return { error: "現場の保存に失敗しました。時間をおいて再度お試しください" };
  }

  revalidatePath("/sites");
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/sites/${siteId}?toast=${encodeURIComponent("保存しました")}`);
}

// ── 現場の削除（管理者のみ・日報が無い場合のみ） ──
export async function deleteSite(siteId: string) {
  await requireAdmin();
  if (!siteId) return { error: "現場が指定されていません" };

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, customerId: true, _count: { select: { reports: true } } },
  });
  if (!site) return { error: "現場が見つかりません" };
  if (site._count.reports > 0) {
    return {
      error: "日報が存在する現場は削除できません。ステータスを『過去』にしてください",
    };
  }
  try {
    await db.site.delete({ where: { id: siteId } });
  } catch {
    return { error: "現場の削除に失敗しました。時間をおいて再度お試しください" };
  }
  revalidatePath("/sites");
  revalidatePath("/");
  revalidatePath(`/customers/${site.customerId}`);
  redirect(`/sites?toast=${encodeURIComponent("現場を削除しました")}`);
}

// ── ステータス変更（SURVEY / ACTIVE / PAST） ──
// 進捗ステージ(0-4: 現調/見積り/受注/施工中/完了)を siteStatus + projectStatus に反映。
// 管理者が現場詳細でタップして手動変更する。
const STAGE_TO_STATUS: { siteStatus: string; projectStatus: string }[] = [
  { siteStatus: "SURVEY", projectStatus: "ESTIMATING" }, // 0 現調
  { siteStatus: "ACTIVE", projectStatus: "ESTIMATING" }, // 1 見積り
  { siteStatus: "ACTIVE", projectStatus: "ORDERED" }, // 2 受注
  { siteStatus: "ACTIVE", projectStatus: "IN_PROGRESS" }, // 3 施工中
  { siteStatus: "PAST", projectStatus: "COMPLETED" }, // 4 完了
];

export async function setSiteStage(
  siteId: string,
  stageIndex: number,
): Promise<{ error?: string } | void> {
  await requireAdmin();
  const target = STAGE_TO_STATUS[stageIndex];
  if (!siteId || !target) return { error: "ステータスの指定が不正です" };
  await db.site.update({
    where: { id: siteId },
    data: { siteStatus: target.siteStatus, projectStatus: target.projectStatus },
  });
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/sites");
  revalidatePath("/");
  revalidatePath("/dispatch");
  revalidatePath("/calendar");
}

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

  // 現調写真: 既存={id} は維持、新規は追加（共有契約2）
  const rawPhotos = formData.get("photos");
  const photos = parseAndValidatePhotosField(typeof rawPhotos === "string" ? rawPhotos : "");
  if ("error" in photos) {
    return { error: photos.error };
  }

  const d = parsed.data;
  const data = {
    address: d.address ?? null,
    keybox: d.keybox ?? null,
    situationMemo: d.situationMemo ?? null,
    relatedNote: d.relatedNote ?? null,
  };

  try {
    await db.$transaction(async (tx) => {
      const survey = await tx.survey.upsert({
        where: { siteId },
        create: { siteId, surveyedAt: new Date(), ...data },
        update: data,
      });

      // kept に無い既存写真のみ削除し、新規を追加（全削除→再作成はしない）
      await tx.photo.deleteMany({
        where: { surveyId: survey.id, id: { notIn: photos.kept } },
      });
      if (photos.added.length > 0) {
        await tx.photo.createMany({
          data: photos.added.map((p) => ({
            surveyId: survey.id,
            reportId: null,
            dataUrl: p.dataUrl,
            thumbUrl: p.thumbUrl ?? null,
            caption: clean(p.caption),
            kind: p.kind && p.kind !== "WORK" ? p.kind : "SURVEY",
            isVideo: p.isVideo,
            width: p.width ?? null,
            height: p.height ?? null,
          })),
        });
      }
    });
  } catch {
    return { error: "現調の保存に失敗しました。時間をおいて再度お試しください" };
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
  revalidatePath("/dispatch");
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
