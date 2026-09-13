"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/session";
import { parseAndValidatePhotosField, type NewPhotoInput } from "@/lib/photos";
import { isNonWorkEventCategory, isPreOrderSite } from "@/lib/constants";

// ── 区分の許容値（@/lib/constants の型に対応） ──
const PROJECT_TYPES = ["REFORM", "RENOVATION", "NEWBUILD", "MAINTENANCE"] as const;
const SITE_STATUSES = ["SURVEY", "ACTIVE", "DECLINED", "PAST"] as const;
const BILLING_STATUSES = ["UNBILLED", "BILLED", "PARTIAL", "PAID"] as const;

// 空文字 → undefined（任意文字列）
const optionalText = z.preprocess(
  (v) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v),
  z.string().optional(),
);

// 空文字 → undefined（任意日付文字列）
const optionalDate = z.preprocess(
  (v) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v),
  z.string().optional(),
);

// 空文字 → undefined（任意の0以上整数。人工など）
const optionalNonNegInt = z.preprocess(
  (v) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v),
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
  billingStatus: z.preprocess(
    (v) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v),
    z.enum(BILLING_STATUSES).optional(),
  ),
  locationName: optionalText,
  address: z.string().min(1, "場所（住所）を入力してください"),
  siteContactName: optionalText,
  siteContactPhone: optionalText,
  keyboxStatus: z.preprocess(
    (v) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v),
    z.enum(["HAS", "NONE"]).optional(),
  ),
  keyboxNumber: optionalText,
  keyboxPlace: optionalText,
  keyboxNoneReason: optionalText,
  keyboxPhotoNoneReason: optionalText,
  drawingNoneReason: optionalText,
  scheduleNoneReason: optionalText,
  targetManDays: optionalNonNegInt,
  receivedDate: optionalDate,
  contractNumber: optionalText,
  plannedStartDate: optionalDate,
  plannedEndDate: optionalDate,
  actualStartDate: optionalDate,
  actualEndDate: optionalDate,
  handoverNote: optionalText,
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
    billingStatus: formData.get("billingStatus"),
    locationName: formData.get("locationName"),
    address: formData.get("address"),
    siteContactName: formData.get("siteContactName"),
    siteContactPhone: formData.get("siteContactPhone"),
    keyboxStatus: formData.get("keyboxStatus"),
    keyboxNumber: formData.get("keyboxNumber"),
    keyboxPlace: formData.get("keyboxPlace"),
    keyboxNoneReason: formData.get("keyboxNoneReason"),
    keyboxPhotoNoneReason: formData.get("keyboxPhotoNoneReason"),
    drawingNoneReason: formData.get("drawingNoneReason"),
    scheduleNoneReason: formData.get("scheduleNoneReason"),
    targetManDays: formData.get("targetManDays"),
    receivedDate: formData.get("receivedDate"),
    contractNumber: formData.get("contractNumber"),
    plannedStartDate: formData.get("plannedStartDate"),
    plannedEndDate: formData.get("plannedEndDate"),
    actualStartDate: formData.get("actualStartDate"),
    actualEndDate: formData.get("actualEndDate"),
    handoverNote: formData.get("handoverNote"),
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
    billingStatus: d.billingStatus ?? null,
    locationName: d.locationName ?? null,
    address: d.address ?? null,
    siteContactName: d.siteContactName ?? null,
    siteContactPhone: d.siteContactPhone ?? null,
    keyboxStatus: d.keyboxStatus ?? null,
    keyboxNumber: d.keyboxNumber ?? null,
    keyboxPlace: d.keyboxPlace ?? null,
    keyboxNoneReason: d.keyboxNoneReason ?? null,
    keyboxPhotoNoneReason: d.keyboxPhotoNoneReason ?? null,
    drawingNoneReason: d.drawingNoneReason ?? null,
    scheduleNoneReason: d.scheduleNoneReason ?? null,
    targetManDays: d.targetManDays ?? null,
    receivedDate: toDate(d.receivedDate),
    contractNumber: d.contractNumber ?? null,
    plannedStartDate: toDate(d.plannedStartDate),
    plannedEndDate: toDate(d.plannedEndDate),
    actualStartDate: toDate(d.actualStartDate),
    actualEndDate: toDate(d.actualEndDate),
    handoverNote: d.handoverNote ?? null,
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

// ── 本登録 / 仮登録の判定 ──
// 本登録に必要な必須項目が揃っていなければ仮登録(provisional=true)。
// 必須: 住所 / キーBOX（HAS→番号, NONE→理由） / キーBOX写真(1枚以上) / 図面 or 工程表(1枚以上)。
// 写真枚数は kept(既存維持) + added(新規) で数える。
type RegistrationFields = {
  address?: string | null;
  keyboxStatus?: string | null;
  keyboxNumber?: string | null;
  keyboxNoneReason?: string | null;
  keyboxPhotoNoneReason?: string | null;
  drawingNoneReason?: string | null;
  scheduleNoneReason?: string | null;
};

// 本登録の判定はここ1本だけ。フォームから来た値でも、保存済みの値でも同じ条件で判定する。
function isRegistrationIncomplete(
  d: RegistrationFields,
  count: (kind: string) => number,
): boolean {
  const hasAddress = !!d.address;
  const keyboxOk =
    d.keyboxStatus === "HAS"
      ? !!d.keyboxNumber
      : d.keyboxStatus === "NONE"
        ? !!d.keyboxNoneReason
        : false;
  // 写真は1枚以上、または「撮れない理由」があれば本登録OK
  const hasKeyboxPhoto = count("KEYBOX") > 0 || !!d.keyboxPhotoNoneReason;
  // 図面・工程表は各々「写真1枚以上、または無い理由」で満たす。両方が必要。
  const hasDrawing = count("DRAWING") > 0 || !!d.drawingNoneReason;
  const hasSchedule = count("SCHEDULE") > 0 || !!d.scheduleNoneReason;
  return !(hasAddress && keyboxOk && hasKeyboxPhoto && hasDrawing && hasSchedule);
}

function computeProvisional(
  d: z.infer<typeof siteSchema>,
  photoSets: SitePhotoSet[],
): boolean {
  return isRegistrationIncomplete(d, (kind) => {
    const set = photoSets.find((s) => s.kind === kind);
    return set ? set.kept.length + set.added.length : 0;
  });
}

// キーBOX「無し」/写真「なし」/図面「なし」を選んだのに理由が空なら保存させない（ハード必須）。
function keyboxReasonError(
  d: z.infer<typeof siteSchema>,
  formData: FormData,
): string | null {
  if (d.keyboxStatus === "NONE" && !d.keyboxNoneReason) {
    return "キーBOXが無い理由を入力してください";
  }
  if (formData.get("keyboxPhotoStatus") === "NONE" && !d.keyboxPhotoNoneReason) {
    return "キーBOX写真が無い理由を入力してください";
  }
  if (formData.get("drawingStatus") === "NONE" && !d.drawingNoneReason) {
    return "図面が無い理由を入力してください";
  }
  if (formData.get("scheduleStatus") === "NONE" && !d.scheduleNoneReason) {
    return "工程表が無い理由を入力してください";
  }
  return null;
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
          dataUrl: p.dataUrl ?? null,
          thumbUrl: p.thumbUrl ?? null,
          blobPath: p.blobPath ?? null,
          mimeType: p.mimeType ?? null,
          sizeBytes: p.sizeBytes ?? null,
          duration: p.duration ?? null,
          caption: p.caption.trim() === "" ? null : p.caption,
          isVideo: p.isVideo,
          width: p.width ?? null,
          height: p.height ?? null,
        })),
      });
    }
  }
}

// 現調フォームの写真・動画を現調記録(Survey)に保存する。
// 置き場所を現調フォーマットと同じにして、後からそちらで増やしたり消したりできるようにする。
async function applySurveyPhotos(
  tx: Prisma.TransactionClient,
  siteId: string,
  photos: { kept: string[]; added: NewPhotoInput[] },
): Promise<void> {
  const existing = await tx.survey.findUnique({ where: { siteId }, select: { id: true } });
  // 現調記録がまだ無く、追加する写真も無いなら何もしない。
  // （受注済から現調に戻した現場を簡易フォームで保存しただけで、空の現調記録が
  //   できてしまうのを防ぐ）
  if (!existing && photos.added.length === 0) return;
  const survey =
    existing ?? (await tx.survey.create({ data: { siteId, surveyedAt: new Date() } }));
  await tx.photo.deleteMany({ where: { surveyId: survey.id, id: { notIn: photos.kept } } });
  if (photos.added.length === 0) return;
  await tx.photo.createMany({
    data: photos.added.map((p) => ({
      surveyId: survey.id,
      dataUrl: p.dataUrl ?? null,
      thumbUrl: p.thumbUrl ?? null,
      blobPath: p.blobPath ?? null,
      mimeType: p.mimeType ?? null,
      sizeBytes: p.sizeBytes ?? null,
      duration: p.duration ?? null,
      caption: p.caption.trim() === "" ? null : p.caption,
      kind: p.kind && p.kind !== "WORK" ? p.kind : "SURVEY",
      isVideo: p.isVideo,
      width: p.width ?? null,
      height: p.height ?? null,
    })),
  });
}

export async function createSite(formData: FormData) {
  // 現場作成は全ユーザー可（作成者を createdById に記録）
  const user = await requireUser();
  const parsed = parseSiteForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const keyboxErr = keyboxReasonError(parsed.data, formData);
  if (keyboxErr) return { error: keyboxErr };
  const photoSets = parseSitePhotoFields(formData);
  if (!Array.isArray(photoSets)) {
    return { error: photoSets.error };
  }
  // 現調は「これから見に行く」段階。基本だけで登録でき、仮登録の催促もしない。
  // 受注済は従来どおり、必須が欠けていれば仮登録として保存する。
  const survey = formData.get("entryMode") === "SURVEY";
  const provisional = survey ? false : computeProvisional(parsed.data, photoSets);

  // 現調は写真・動画を現調記録(Survey)側に置く
  const rawSurveyPhotos = formData.get("surveyPhotos");
  const surveyPhotos = survey
    ? parseAndValidatePhotosField(typeof rawSurveyPhotos === "string" ? rawSurveyPhotos : "")
    : { kept: [], added: [] };
  if ("error" in surveyPhotos) return { error: surveyPhotos.error };

  // 現調のメモ（現場メモとして残す。2000文字はメモ側の上限に合わせる）
  const rawMemo = formData.get("siteMemo");
  const surveyMemo =
    survey && typeof rawMemo === "string"
      ? rawMemo.replace(/\r\n/g, "\n").trim().slice(0, 2000)
      : "";

  let siteId: string;
  let customerId: string;
  try {
    const site = await db.$transaction(async (tx) => {
      const created = await tx.site.create({
        // 現調は区分「現調」。受注済は進行中で、工程は「配線」から始める。
        data: {
          ...toData(parsed.data),
          createdById: user.id,
          provisional,
          siteStatus: survey ? "SURVEY" : "ACTIVE",
          projectStatus: survey ? "ESTIMATING" : "ORDERED",
        },
      });
      await applySitePhotoSets(tx, created.id, photoSets);
      if (survey && surveyPhotos.added.length > 0) {
        await applySurveyPhotos(tx, created.id, surveyPhotos);
      }
      // 現調で書いたメモは、現場詳細「連絡・メモ」の現場メモに1件として残す
      if (surveyMemo) {
        await tx.siteMemo.create({
          data: { siteId: created.id, content: surveyMemo, createdById: user.id, atSurvey: true },
        });
      }
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

// ── 現場のクイック作成（カレンダー/配員からの簡易登録） ──
// 現場登録は項目が多く手間なので、名前だけで「仮登録(provisional)」の現場を即作成する導線。
// 受け皿の顧客は既定顧客「その他」。作成後は現場詳細から必要項目を追記できる。
export async function quickCreateSite(
  name: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const user = await requireUser();
  const n = (name ?? "").trim();
  if (!n) return { error: "現場名を入力してください" };
  if (n.length > 100) return { error: "現場名が長すぎます" };
  try {
    // 既定顧客「その他」を受け皿にする（無ければ作成）
    let customer = await db.customer.findFirst({
      where: { name: "その他" },
      select: { id: true },
    });
    if (!customer) {
      customer = await db.customer.create({
        data: { name: "その他", memo: "顧客登録に該当しない現場の受け皿（デフォルト）" },
        select: { id: true },
      });
    }
    const site = await db.site.create({
      data: {
        name: n,
        customerId: customer.id,
        siteStatus: "ACTIVE", // すぐ配員/予定に使えるよう進行中で作成
        projectStatus: "ORDERED", // 工程は「配線」から（現調は区分側で表す）
        provisional: true, // 仮登録（詳細は後から追記）
        createdById: user.id,
      },
      select: { id: true, name: true },
    });
    revalidatePath("/calendar");
    revalidatePath("/dispatch");
    revalidatePath("/sites");
    revalidatePath("/");
    return { id: site.id, name: site.name };
  } catch {
    return { error: "現場の作成に失敗しました。時間をおいて再度お試しください" };
  }
}

// ── 現場未指定の予定を「現場化」する（配員のワンタップ変換） ──
// 件名だけで登録された予定を、その件名で仮登録の現場に紐づけ、参加者を現場入りに変換する。
export async function convertEventToSite(
  eventId: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!eventId) return { error: "予定が指定されていません" };
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      siteId: true,
      date: true,
      category: true,
      isPrivate: true,
      ownerId: true,
      participants: { select: { userId: true } },
    },
  });
  if (!event) return { error: "予定が見つかりません" };
  // 非公開の個人予定は所有者以外には見えない。現場化もさせない（見える形に変わってしまうため）。
  if (event.isPrivate && event.ownerId !== user.id) return { error: "予定が見つかりません" };
  if (event.siteId) return { error: "この予定は既に現場が設定されています" };
  try {
    let customer = await db.customer.findFirst({
      where: { name: "その他" },
      select: { id: true },
    });
    if (!customer) {
      customer = await db.customer.create({
        data: { name: "その他", memo: "顧客登録に該当しない現場の受け皿（デフォルト）" },
        select: { id: true },
      });
    }
    const name = (event.title || "現場").trim().slice(0, 100) || "現場";
    const site = await db.site.create({
      data: {
        name,
        customerId: customer.id,
        siteStatus: "ACTIVE",
        projectStatus: "ORDERED", // 工程は「配線」から（現調は区分側で表す）
        provisional: true,
        createdById: user.id,
      },
      select: { id: true },
    });
    // 予定を現場に紐づける（現場の予定は配員・日報に連動するので非公開は解除する）
    await db.calendarEvent.update({
      where: { id: event.id },
      data: { siteId: site.id, isPrivate: false },
    });
    // 現場作業なら参加者を現場入りに（休み/その他/事務所作業は作らない）
    const participantIds = event.participants.map((p) => p.userId);
    if (participantIds.length > 0 && !isNonWorkEventCategory(event.category)) {
      const existing = await db.siteVisit.findMany({
        where: { siteId: site.id, date: event.date, userId: { in: participantIds } },
        select: { userId: true },
      });
      const have = new Set(existing.map((v) => v.userId));
      const missing = participantIds.filter((u) => !have.has(u));
      if (missing.length > 0) {
        await db.siteVisit.createMany({
          data: missing.map((uid) => ({
            siteId: site.id,
            userId: uid,
            date: event.date,
            createdById: user.id,
          })),
        });
      }
    }
    revalidatePath("/dispatch");
    revalidatePath("/calendar");
    revalidatePath("/sites");
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { error: "現場化に失敗しました。時間をおいて再度お試しください" };
  }
}

export async function updateSite(siteId: string, formData: FormData) {
  // 編集は全ログインユーザー可（現場情報は全員で最新に保つ運用。作成は元々全員可）
  await requireUser();
  const existing = await db.site.findUnique({
    where: { id: siteId },
    select: { createdById: true, siteStatus: true },
  });
  if (!existing) return { error: "現場が見つかりません" };
  const parsed = parseSiteForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const keyboxErr = keyboxReasonError(parsed.data, formData);
  if (keyboxErr) return { error: keyboxErr };
  const photoSets = parseSitePhotoFields(formData);
  if (!Array.isArray(photoSets)) {
    return { error: photoSets.error };
  }
  // 現調・見送りは情報が揃っていないのが普通なので、仮登録の催促はしない
  //（受注済にする時に判定する。見送りに催促を出すと cron が毎日通知してしまう）
  const surveyEdit = isPreOrderSite(existing.siteStatus);
  const provisional = surveyEdit ? false : computeProvisional(parsed.data, photoSets);

  // 現調・見送りの修正画面はキーBOX・資料・管理の欄を出さない。出していない欄はフォームから
  // 送られてこないため、toData をそのまま当てると既存値を null で消してしまう。
  // このときは画面に出している項目だけを更新し、他は今の値のままにする。
  const d = parsed.data;
  const data = surveyEdit
    ? {
        customerId: d.customerId,
        name: d.name,
        projectType: d.projectType,
        address: d.address ?? null,
        siteContactName: d.siteContactName ?? null,
        siteContactPhone: d.siteContactPhone ?? null,
      }
    : toData(d);

  // 現調・見送りの画面に出している写真・動画（現調記録側の置き場所）
  const rawSurveyPhotos = formData.get("surveyPhotos");
  const surveyPhotos =
    surveyEdit && typeof rawSurveyPhotos === "string"
      ? parseAndValidatePhotosField(rawSurveyPhotos)
      : null;
  if (surveyPhotos && "error" in surveyPhotos) return { error: surveyPhotos.error };

  let customerId: string;
  try {
    const site = await db.$transaction(async (tx) => {
      const updated = await tx.site.update({
        where: { id: siteId },
        // createdById は変更しない（作成者は保持）
        data: { ...data, provisional },
      });
      // 写真の欄（キーBOX/図面/工程表）は簡易フォームでは出していないので触らない
      if (!surveyEdit) await applySitePhotoSets(tx, siteId, photoSets);
      if (surveyPhotos) await applySurveyPhotos(tx, siteId, surveyPhotos);
      return updated;
    });
    customerId = site.customerId;
  } catch {
    return { error: "現場の保存に失敗しました。時間をおいて再度お試しください" };
  }

  revalidatePath("/sites");
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/survey`);
  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/sites/${siteId}?toast=${encodeURIComponent("保存しました")}`);
}

// ── 現場の削除（管理者のみ） ──
// ステータスや日報の有無に関わらず削除可。紐づくデータ（日報・写真・現場入り・予定・
// TODO・現調・材料など）は全リレーションの onDelete: Cascade で一緒に削除される。
// UI 側で「本当に削除しますか？全てのデータが消えます」の二重確認を挟む前提。
export async function deleteSite(siteId: string) {
  await requireAdmin();
  if (!siteId) return { error: "現場が指定されていません" };

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, customerId: true },
  });
  if (!site) return { error: "現場が見つかりません" };
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

// ── 進捗ステージ変更 ──
// 進捗7工程(0-6: 現調/配線/調査/ボード開口/器具付/段取り/完了)を siteStatus + projectStatus に反映。
// projectStatus(6値) を各工程のマーカーに流用し、完了のみ siteStatus=PAST（過去）にする。
// 管理者が現場詳細でタップして手動変更する。
const STAGE_TO_STATUS: { siteStatus: string; projectStatus: string }[] = [
  { siteStatus: "ACTIVE", projectStatus: "ORDERED" }, // 0 配線
  { siteStatus: "ACTIVE", projectStatus: "STARTED" }, // 1 調査
  { siteStatus: "ACTIVE", projectStatus: "IN_PROGRESS" }, // 2 ボード開口
  { siteStatus: "ACTIVE", projectStatus: "COMPLETED" }, // 3 器具付
  { siteStatus: "ACTIVE", projectStatus: "CLOSED" }, // 4 段取り
  { siteStatus: "PAST", projectStatus: "CLOSED" }, // 5 完了
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

// ── 現調の現場を「受注済」にする / 「見送り」にする ──
// 受注するかは現調から戻ったあとに決まる。判断は管理者が行う。

// 保存済みの値から本登録の判定をやり直す（フォーム経由の computeProvisional と同じ条件）。
// 現調から受注済へ移したときに、足りない項目があれば仮登録バッジで催促するために使う。
async function recomputeProvisional(siteId: string): Promise<boolean> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      address: true,
      keyboxStatus: true,
      keyboxNumber: true,
      keyboxNoneReason: true,
      keyboxPhotoNoneReason: true,
      drawingNoneReason: true,
      scheduleNoneReason: true,
      photos: { select: { kind: true } },
    },
  });
  if (!site) return true;
  return isRegistrationIncomplete(site, (kind) =>
    site.photos.filter((p) => p.kind === kind).length,
  );
}

export async function startOrderedSite(
  siteId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin();
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      siteStatus: true,
      projectStatus: true,
      survey: { select: { address: true, keybox: true } },
    },
  });
  if (!site) return { error: "現場が見つかりません" };
  // 受注済にできるのは現調・見送りの現場だけ（進行中や過去の現場を巻き戻さない）
  if (!isPreOrderSite(site.siteStatus)) {
    return { error: "現調・見送りの現場のみ受注済にできます" };
  }

  // 現調で書いた住所・キーBOXを現場本体へ引き継ぐ（本体が未入力のときだけ）
  if (site.survey) {
    await backfillSiteFromSurvey(
      siteId,
      site.survey.address ?? null,
      site.survey.keybox ?? null,
    );
  }
  await db.site.update({
    where: { id: siteId },
    data: {
      siteStatus: "ACTIVE",
      // 現調から初めて受注済にするときは工程を「配線」から始める。
      // 受注済から現調に戻していた現場は戻す前の工程をそのまま持っているので、
      // 触らずに元の工程へ復帰させる（器具付まで進んでいたら器具付に戻る）。
      projectStatus: site.projectStatus === "ESTIMATING" ? "ORDERED" : site.projectStatus,
      // 足りない項目があれば仮登録として残りの入力を促す（現調の間は催促しない）。
      provisional: await recomputeProvisional(siteId),
    },
  });
  revalidateSiteViews(siteId);
  return { ok: true };
}

export async function declineSite(
  siteId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin();
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { siteStatus: true },
  });
  if (!site) return { error: "現場が見つかりません" };
  if (site.siteStatus !== "SURVEY") return { error: "現調の現場のみ見送りにできます" };
  await db.site.update({ where: { id: siteId }, data: { siteStatus: "DECLINED" } });
  revalidateSiteViews(siteId);
  return { ok: true };
}

// 見送り・受注済（進行中）の現場を現調に戻す。
// 受注済で登録したあとに「まだ現調だった」と分かることがあるため、進行中からも戻せる。
// 入力済みの情報（キーBOX・図面・工程表・日程・写真・日報など）は一切消さずそのまま残し、
// 工程(projectStatus)も触らない。受注済に戻したときに元の状態へそのまま復帰させるため。
export async function revertSiteToSurvey(
  siteId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin();
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { siteStatus: true },
  });
  if (!site) return { error: "現場が見つかりません" };
  if (site.siteStatus === "SURVEY") return { error: "すでに現調の現場です" };
  // 完工した現場はまず工程を戻してから（過去の現場を現調に落とすと集計が合わなくなる）
  if (site.siteStatus === "PAST") {
    return { error: "完了した現場は現調に戻せません。工程を戻してからお試しください" };
  }
  await db.site.update({
    where: { id: siteId },
    // 現調の間は仮登録の催促をしない（受注済に戻すときに判定し直す）
    data: { siteStatus: "SURVEY", provisional: false },
  });
  revalidateSiteViews(siteId);
  return { ok: true };
}

function revalidateSiteViews(siteId: string) {
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/edit`); // 受注済にした直後に開く画面

  revalidatePath("/sites");
  revalidatePath("/");
  revalidatePath("/dispatch");
  revalidatePath("/reports");
  revalidatePath("/calendar");
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
  // 現調に行った本人が現場で書けるよう、全ログインユーザーに開放する
  await requireUser();
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
            dataUrl: p.dataUrl ?? null,
            thumbUrl: p.thumbUrl ?? null,
            blobPath: p.blobPath ?? null,
            mimeType: p.mimeType ?? null,
            sizeBytes: p.sizeBytes ?? null,
            duration: p.duration ?? null,
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
