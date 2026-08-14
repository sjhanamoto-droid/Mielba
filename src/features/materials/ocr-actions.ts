"use server";

// 材料のOCR登録（最高管理者のみ）。
// 納品書/発注書の写真を Claude Vision（structured outputs）で読み取り、
// 材料名・数量・単位・単価・金額・仕入先・伝票日付を抽出する。
// 抽出結果を確認・修正したうえで、現場（Site）に SiteMaterial として登録する。

import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";

// ───────────────────────── OCR（納品書/発注書の読み取り） ─────────────────────────

const ocrItemSchema = z.object({
  name: z.string().describe("材料・商品の名称（例: 石膏ボード 12.5mm）"),
  quantity: z
    .string()
    .nullable()
    .describe("数量の数値部分（例: 10）。不明なら null"),
  unit: z
    .string()
    .nullable()
    .describe("単位（例: 枚・本・箱・m・㎡）。不明なら null"),
  unitPrice: z
    .number()
    .int()
    .nullable()
    .describe("単価（円・整数・税抜/税込は問わず伝票の記載値）。不明なら null"),
  amount: z
    .number()
    .int()
    .nullable()
    .describe("金額＝その行の合計（円・整数）。不明なら null"),
});

const ocrSchema = z.object({
  documentType: z
    .enum(["DELIVERY", "ORDER", "UNKNOWN"])
    .describe("伝票種別。納品書=DELIVERY、発注書=ORDER、判別不能=UNKNOWN"),
  siteName: z
    .string()
    .nullable()
    .describe("伝票に記載された現場名・宛名・工事名（現場の確認用）。無ければ null"),
  supplier: z
    .string()
    .nullable()
    .describe("仕入先・発行元の会社名。無ければ null"),
  orderedAt: z
    .string()
    .nullable()
    .describe("伝票の日付。YYYY-MM-DD 形式。不明なら null"),
  items: z.array(ocrItemSchema).describe("明細行（材料・数量・単価・金額）。無ければ空配列"),
});

const OCR_SYSTEM_PROMPT = [
  "あなたは建設会社の資材伝票（納品書・発注書）を読み取るOCRアシスタントです。",
  "画像に写った1枚の伝票から、次を日本語で正確に抽出します。原本に無い情報を創作しないこと。",
  "- documentType: 納品書なら DELIVERY、発注書なら ORDER、判別できなければ UNKNOWN。",
  "- siteName: 伝票の宛名・現場名・工事名（例: 「○○様邸 新築工事」）。無ければ null。",
  "- supplier: 発行元（仕入先・商社・メーカー）の会社名。無ければ null。",
  "- orderedAt: 伝票の日付を YYYY-MM-DD で。和暦は西暦へ変換。不明なら null。",
  "- items: 明細を1行ずつ。name（品名）, quantity（数量の数値のみ・文字列）, unit（単位）, unitPrice（単価・円の整数）, amount（金額＝行合計・円の整数）。",
  "金額はカンマや「¥」を除いた整数にする。小計・消費税・合計などの集計行は items に含めない（材料の明細行のみ）。",
  "読み取れない項目は無理に埋めず null にする。",
].join("\n");

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
type ParsedSource =
  | { kind: "image"; mediaType: ImageMedia; data: string }
  | { kind: "pdf"; data: string };

// data:image/jpeg;base64,xxxx / data:application/pdf;base64,xxxx を判別する
function parseDataUrl(dataUrl: string): ParsedSource | null {
  const img = /^data:(image\/(jpeg|png|gif|webp));base64,(.+)$/.exec(dataUrl);
  if (img) return { kind: "image", mediaType: img[1] as ImageMedia, data: img[3] };
  const pdf = /^data:application\/pdf;base64,(.+)$/.exec(dataUrl);
  if (pdf) return { kind: "pdf", data: pdf[1] };
  return null;
}

export type OcrItem = {
  name: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number | null;
};

export type OcrResult = {
  documentType: "DELIVERY" | "ORDER" | null;
  siteName: string | null;
  supplier: string | null;
  orderedAt: string | null;
  items: OcrItem[];
};

export type OcrResponse =
  | { status: "unconfigured" } // ANTHROPIC_API_KEY 未設定
  | { status: "error"; message: string }
  | { status: "ok"; result: OcrResult };

export async function ocrDeliverySlip(input: { dataUrl: string }): Promise<OcrResponse> {
  await requireSuperAdmin();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: "unconfigured" };

  const parsed = parseDataUrl(input.dataUrl || "");
  if (!parsed) {
    return { status: "error", message: "対応していない形式です（JPEG・PNG・PDF）。もう一度お試しください。" };
  }

  // 画像は image ブロック、PDFは document ブロックとして Claude に渡す
  const sourceBlock =
    parsed.kind === "pdf"
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: parsed.data },
        }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: parsed.mediaType, data: parsed.data },
        };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 4096,
      system: OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            sourceBlock,
            {
              type: "text",
              text: "この納品書または発注書を読み取り、材料の明細を抽出してください。",
            },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(ocrSchema),
      },
    });

    const out = response.parsed_output;
    if (!out) {
      return { status: "error", message: "伝票を読み取れませんでした。明るい場所で撮り直してください。" };
    }

    return {
      status: "ok",
      result: {
        documentType: out.documentType === "UNKNOWN" ? null : out.documentType,
        siteName: out.siteName,
        supplier: out.supplier,
        orderedAt: out.orderedAt,
        items: out.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unitPrice,
          amount: i.amount,
        })),
      },
    };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[material-ocr] Claude API エラー:", e.status, e.message);
    } else {
      console.error("[material-ocr] 予期しないエラー:", e);
    }
    return { status: "error", message: "読み取りに失敗しました。時間をおいて再度お試しください。" };
  }
}

// ───────────────────────── 登録・管理（SiteMaterial） ─────────────────────────

const registerItemSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.string().trim().nullish(),
  unit: z.string().trim().nullish(),
  unitPrice: z.number().int().nullish(),
  amount: z.number().int().nullish(),
});

const registerSchema = z.object({
  siteId: z.string().min(1),
  documentType: z.enum(["DELIVERY", "ORDER"]).nullish(),
  supplier: z.string().trim().nullish(),
  orderedAt: z.string().trim().nullish(), // YYYY-MM-DD
  items: z.array(registerItemSchema).min(1, "材料を1件以上入力してください"),
  photo: z
    .object({
      dataUrl: z.string().min(1),
      thumbUrl: z.string().nullish(),
      width: z.number().int().nullish(),
      height: z.number().int().nullish(),
    })
    .nullish(),
});

export type RegisterMaterialsInput = z.infer<typeof registerSchema>;
export type RegisterMaterialsState = { error?: string; ok?: boolean; count?: number };

export async function registerSiteMaterials(
  input: RegisterMaterialsInput,
): Promise<RegisterMaterialsState> {
  const me = await requireSuperAdmin();

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  }
  const d = parsed.data;

  const site = await db.site.findUnique({ where: { id: d.siteId }, select: { id: true } });
  if (!site) return { error: "現場が見つかりません" };

  // 伝票日付（YYYY-MM-DD）をローカル午前0時の DateTime に。不正な値は無視。
  let orderedAt: Date | null = null;
  if (d.orderedAt && /^\d{4}-\d{2}-\d{2}$/.test(d.orderedAt)) {
    const dt = new Date(`${d.orderedAt}T00:00:00`);
    if (!Number.isNaN(dt.getTime())) orderedAt = dt;
  }

  try {
    await db.$transaction(async (tx) => {
      // 伝票写真を保存（任意）。金額が写るため現場(siteId)には紐付けない
      // ＝現場の写真一覧に出さず、SiteMaterial.photoId からのみ参照する（最高管理者専用）。
      let photoId: string | null = null;
      if (d.photo?.dataUrl) {
        const photo = await tx.photo.create({
          data: {
            dataUrl: d.photo.dataUrl,
            thumbUrl: d.photo.thumbUrl ?? null,
            caption: d.supplier ?? (d.documentType === "ORDER" ? "発注書" : "納品書"),
            kind: d.documentType === "ORDER" ? "ORDER" : "DELIVERY",
            width: d.photo.width ?? null,
            height: d.photo.height ?? null,
          },
          select: { id: true },
        });
        photoId = photo.id;
      }

      await tx.siteMaterial.createMany({
        data: d.items.map((i) => ({
          siteId: d.siteId,
          name: i.name,
          quantity: i.quantity?.trim() ? i.quantity.trim() : null,
          unit: i.unit?.trim() ? i.unit.trim() : null,
          unitPrice: i.unitPrice ?? null,
          amount: i.amount ?? null,
          documentType: d.documentType ?? null,
          supplier: d.supplier?.trim() ? d.supplier.trim() : null,
          orderedAt,
          photoId,
          createdById: me.id,
        })),
      });
    });
  } catch {
    return { error: "材料の登録に失敗しました。時間をおいて再度お試しください" };
  }

  revalidatePath(`/materials/${d.siteId}`);
  revalidatePath(`/sites/${d.siteId}`);
  return { ok: true, count: d.items.length };
}

/** 登録材料の有効/無効を切り替える（無効は日報の選択肢に出さない） */
export async function toggleSiteMaterial(id: string): Promise<RegisterMaterialsState> {
  await requireSuperAdmin();
  if (!id) return { error: "材料が見つかりません" };
  try {
    const m = await db.siteMaterial.findUnique({ where: { id }, select: { active: true, siteId: true } });
    if (!m) return { error: "材料が見つかりません" };
    await db.siteMaterial.update({ where: { id }, data: { active: !m.active } });
    revalidatePath(`/materials/${m.siteId}`);
  } catch {
    return { error: "切り替えに失敗しました。時間をおいて再度お試しください" };
  }
  return { ok: true };
}

/** 登録材料を削除する（日報での使用実績が無い場合のみ。ある場合は無効化を案内） */
export async function deleteSiteMaterial(id: string): Promise<RegisterMaterialsState> {
  await requireSuperAdmin();
  if (!id) return { error: "材料が見つかりません" };
  try {
    const m = await db.siteMaterial.findUnique({ where: { id }, select: { name: true, siteId: true } });
    if (!m) return { error: "材料が見つかりません" };
    // 日報側は材料を名前で記録するため、同名の使用実績があれば削除しない
    const used = await db.materialUse.count({
      where: { name: m.name, report: { siteId: m.siteId } },
    });
    if (used > 0) {
      return { error: `「${m.name}」は日報で ${used} 件使用されているため削除できません。「無効」に切り替えてください` };
    }
    await db.siteMaterial.delete({ where: { id } });
    revalidatePath(`/materials/${m.siteId}`);
  } catch {
    return { error: "削除に失敗しました。時間をおいて再度お試しください" };
  }
  return { ok: true };
}
