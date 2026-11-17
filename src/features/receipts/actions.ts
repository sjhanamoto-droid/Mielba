"use server";

// 領収書読み取り（管理者以上）。
// 写真・PDF（Blob に直接上げたもの）を Claude で読み取り、確認したものを MF の仕訳インポート CSV に出す。
// 現場とは結び付けない、会社全体の経費の領収書を扱う単体の機能。

import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { deleteBlobPaths, readBlobBytes } from "@/lib/media";
import { OCR_PDF_MAX_BYTES } from "@/lib/media-limits";
import { isMediaBlobPath } from "@/lib/photos";
import { jstDateKey } from "@/lib/date";
import { putInTrash, snapshotBlobPaths, snapshotGraph } from "@/lib/trash";
import {
  buildMfCsv,
  isDateKey,
  RECEIPT_ACCOUNTS,
  TAX_10,
  TAX_8,
  yen,
} from "@/lib/receipts";

/** 普段の読み取り（安くて速いモデル） */
const OCR_MODEL = process.env.RECEIPT_OCR_MODEL || "claude-haiku-5-5";
/** 「高精度で読み直す」で使うモデル */
const OCR_PRECISE_MODEL = process.env.RECEIPT_OCR_PRECISE_MODEL || "claude-sonnet-5-5";

type Result = { ok?: true; error?: string };

function revalidate() {
  revalidatePath("/receipts");
}

// ───────────────────────── 登録（アップロード直後） ─────────────────────────

const createSchema = z.object({
  blobPath: z.string().refine(isMediaBlobPath, "ファイルの保存先が不正です"),
  mimeType: z.enum(["image/jpeg", "application/pdf"]),
  thumbUrl: z.string().startsWith("data:image/").max(200_000).nullish(),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
  fileName: z.string().max(200).nullish(),
});

export type CreateReceiptResult =
  | { ok: true; id: string }
  | { duplicate: string }
  | { error: string };

/** 同じファイルが既に登録されていないか（アップロード前に確かめる） */
export async function findDuplicateReceipt(fileHash: string): Promise<string | null> {
  await requireAdmin();
  if (!/^[0-9a-f]{64}$/.test(fileHash)) return null;
  const dup = await db.receipt.findFirst({
    where: { fileHash },
    select: { receiptDate: true, vendor: true, totalAmount: true, createdAt: true },
  });
  if (!dup) return null;
  return duplicateLabel(dup);
}

function duplicateLabel(r: {
  receiptDate: string | null;
  vendor: string | null;
  totalAmount: number | null;
  createdAt: Date;
}): string {
  const parts = [
    r.receiptDate ? r.receiptDate.slice(5).replace("-", "/") : null,
    r.vendor,
    r.totalAmount != null ? yen(r.totalAmount) : null,
  ].filter(Boolean);
  return parts.length ? parts.join("・") : `${jstDateKey(r.createdAt).slice(5).replace("-", "/")} に登録したもの`;
}

export async function createReceipt(input: z.input<typeof createSchema>): Promise<CreateReceiptResult> {
  const me = await requireAdmin();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const d = parsed.data;

  if (d.fileHash) {
    const dup = await db.receipt.findFirst({
      where: { fileHash: d.fileHash },
      select: { receiptDate: true, vendor: true, totalAmount: true, createdAt: true },
    });
    if (dup) return { duplicate: duplicateLabel(dup) };
  }

  const r = await db.receipt.create({
    data: {
      blobPath: d.blobPath,
      mimeType: d.mimeType,
      thumbUrl: d.thumbUrl ?? null,
      fileHash: d.fileHash ?? null,
      fileName: d.fileName ?? null,
      uploadedById: me.id,
    },
    select: { id: true },
  });
  revalidate();
  return { ok: true, id: r.id };
}

// ───────────────────────── 読み取り（Claude） ─────────────────────────

const ocrLineSchema = z.object({
  taxRate: z.enum(["10", "8", "0"]).describe("消費税率。10=標準税率、8=軽減税率（食品など）、0=非課税・対象外"),
  amount: z.number().int().describe("この行の税込金額（円・整数）"),
  account: z.string().describe("勘定科目（指定の一覧から選ぶ）"),
});

const ocrSchema = z.object({
  isReceipt: z.boolean().describe("領収書・レシート・請求書として読めるか"),
  receiptDate: z.string().nullable().describe("発行日・利用日。YYYY-MM-DD。不明なら null"),
  vendor: z.string().nullable().describe("店名・発行元の会社名（支店名は省いてよい）。不明なら null"),
  invoiceNumber: z
    .string()
    .nullable()
    .describe("適格請求書発行事業者の登録番号（T＋13桁の数字）。記載が無ければ null"),
  totalAmount: z.number().int().nullable().describe("支払った合計金額（税込・円・整数）。不明なら null"),
  paymentMethod: z
    .enum(["CASH", "CARD", "BANK", "UNKNOWN"])
    .describe("支払い方法。現金=CASH、クレジットカード・電子マネー・QR決済=CARD、振込・口座引落=BANK、不明=UNKNOWN"),
  summary: z.string().nullable().describe("買ったもの・用途の短い要約（20文字程度。例: ボールペン・付箋、ガソリン代）"),
  lines: z.array(ocrLineSchema).describe("税率・勘定科目ごとの金額。合計が totalAmount と一致するように"),
});

function ocrSystemPrompt(today: string): string {
  return [
    "あなたは電気工事会社の経理担当を手伝うOCRアシスタントです。",
    "画像の領収書・レシート1枚を読み取り、会計ソフト（マネーフォワード）に仕訳として入れるための情報を抽出します。",
    "原本に無い情報を創作しないこと。読めない項目は null にする。",
    `今日は ${today} です。年が書かれていない・2桁の年の場合は、今日以前で最も近い日付として西暦にする。和暦は西暦に直す。`,
    "金額はカンマや「¥」「円」を除いた整数にする。",
    "",
    "lines（明細）の作り方:",
    "- 税率ごとに1行にまとめる。レシートに「10%対象」「8%対象（軽減）」などの税率別の合計があればその税込金額を使う。",
    "- 軽減税率8%は飲食料品（持ち帰り）や新聞。外食・酒類・日用品は10%。",
    "- 印紙・切手・行政手数料など消費税がかからないものは taxRate=0。",
    "- 同じ税率でも明らかに用途の違うもの（例: 来客用のお菓子と文房具）は勘定科目を分けて別の行にしてよい。",
    "- lines の金額の合計が totalAmount と一致するようにする。",
    "",
    `勘定科目は次の一覧から選ぶ: ${RECEIPT_ACCOUNTS.join("、")}`,
    "目安（会社のMFの科目の説明に合わせる）:",
    "- 消耗品費: 文房具類・パソコン関連用品・工具・作業用品・日用品など、使える期間が1年に満たない物品",
    "- 旅費交通費: 電車・バス・タクシー・高速道路・駐車場・宿泊",
    "- 車両費: ガソリン・洗車・オイル交換など車の費用",
    "- 会議費: 打合せの飲食・カフェ",
    "- 接待交際費: 得意先・取引先との食事、お歳暮・お中元・お土産",
    "- 通信費: インターネット利用料・電話代・切手・郵便などの送付費用",
    "- 新聞図書費: 書籍・雑誌・新聞",
    "- 水道光熱費: 電気代・ガス代・水道代",
    "- 修繕費: 事務所・店舗・機械・車などのメンテナンスや壊れたものの補修",
    "- 租税公課: 収入印紙・税金・車庫証明や印鑑証明書などの公的な書類の発行手数料",
    "- 荷造運賃: 梱包材料を含む発送費用",
    "- 広告宣伝費: チラシ・POP・試供品・ネット広告",
    "- 損害保険料: 事務所や事業用の車の保険",
    "- 材料費: 工事に使う電線・配管・器具などの部材",
    "- 支払手数料: 振込手数料など、福利厚生費: 従業員全体のための飲食・慰安、雑費: どれにも当たらないもの",
    "1点が10万円を超える物品は、勘定科目を消耗品費にしたうえで summary の先頭に「10万円超」と書く（経理が判断する）。",
  ].join("\n");
}

function taxCategoryOf(rate: "10" | "8" | "0"): string {
  return rate === "8" ? TAX_8 : rate === "0" ? "対象外" : TAX_10;
}

function creditOf(method: "CASH" | "CARD" | "BANK" | "UNKNOWN"): string {
  return method === "CARD" ? "未払金" : method === "BANK" ? "普通預金" : "現金";
}

/**
 * 登録した領収書を読み取る。precise=true は「高精度で読み直す」（上位モデル）。
 * 出力済みのものは読み直さない（MF に入れた内容とずれるため、先に出力を取り消してもらう）。
 */
export async function runReceiptOcr(id: string, precise = false): Promise<Result> {
  await requireAdmin();
  const r = await db.receipt.findUnique({
    where: { id },
    select: { id: true, blobPath: true, mimeType: true, exportId: true },
  });
  if (!r) return { error: "領収書が見つかりません" };
  if (r.exportId) return { error: "出力済みのため読み直せません。先にこの回の出力を取り消してください" };

  const fail = async (message: string): Promise<Result> => {
    await db.receipt.update({ where: { id }, data: { status: "FAILED", ocrError: message } });
    revalidate();
    return { error: message };
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail("読み取りの設定（APIキー）がありません。開発担当に連絡してください");
  if (!isMediaBlobPath(r.blobPath)) return fail("ファイルの保存先が不正です");

  await db.receipt.update({ where: { id }, data: { status: "PROCESSING", ocrError: null } });

  let bytes: Buffer | null = null;
  try {
    bytes = await readBlobBytes(r.blobPath, OCR_PDF_MAX_BYTES);
  } catch (e) {
    console.error("[receipt-ocr] 読み出し失敗:", e);
  }
  if (!bytes) return fail("ファイルを読み込めませんでした。もう一度お試しください");

  const data = bytes.toString("base64");
  const sourceBlock =
    r.mimeType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } };

  const model = precise ? OCR_PRECISE_MODEL : OCR_MODEL;
  let out: z.infer<typeof ocrSchema> | null = null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model,
      // 思考が既定でオンのモデルなので、思考分で JSON が切れないよう余裕を持たせる
      max_tokens: 16000,
      system: ocrSystemPrompt(jstDateKey()),
      messages: [
        {
          role: "user",
          content: [sourceBlock, { type: "text", text: "この領収書・レシートを読み取ってください。" }],
        },
      ],
      // 普段は速さと費用を優先（low）。読み直しは上位モデルを既定の深さで
      output_config: { format: zodOutputFormat(ocrSchema), ...(precise ? {} : { effort: "low" as const }) },
    });
    out = response.parsed_output ?? null;
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error("[receipt-ocr] Claude API エラー:", e.status, e.message);
    else console.error("[receipt-ocr] 予期しないエラー:", e);
    return fail("読み取りに失敗しました。時間をおいて「読み直す」を押してください");
  }
  if (!out) return fail("読み取れませんでした。明るい場所で撮り直すか、「高精度で読み直す」を押してください");

  const receiptDate = isDateKey(out.receiptDate) ? out.receiptDate : null;
  const vendor = out.vendor?.trim() || null;
  const invoiceNumber = normalizeInvoice(out.invoiceNumber);
  let lines = out.lines
    .filter((l) => Number.isFinite(l.amount) && l.amount !== 0)
    .map((l) => ({
      account: l.account?.trim() || "雑費",
      taxCategory: taxCategoryOf(l.taxRate),
      amount: l.amount,
    }));
  if (lines.length === 0 && out.totalAmount != null) {
    lines = [{ account: "雑費", taxCategory: TAX_10, amount: out.totalAmount }];
  }
  let creditAccount = creditOf(out.paymentMethod);

  // 同じお店（登録番号か店名）で前に確認したものがあれば、勘定科目と支払い方法をそれに合わせる
  const prev =
    invoiceNumber || vendor
      ? await db.receipt.findFirst({
          where: {
            status: "CONFIRMED",
            id: { not: id },
            OR: [
              ...(invoiceNumber ? [{ invoiceNumber }] : []),
              ...(vendor ? [{ vendor }] : []),
            ],
          },
          orderBy: { confirmedAt: "desc" },
          select: { creditAccount: true, lines: { select: { account: true } } },
        })
      : null;
  if (prev) {
    const accounts = new Set(prev.lines.map((l) => l.account));
    if (accounts.size === 1) {
      const only = [...accounts][0];
      lines = lines.map((l) => ({ ...l, account: only }));
    }
    if (out.paymentMethod === "UNKNOWN") creditAccount = prev.creditAccount;
  }

  await db.$transaction([
    db.receiptLine.deleteMany({ where: { receiptId: id } }),
    db.receipt.update({
      where: { id },
      data: {
        status: "REVIEW",
        receiptDate,
        vendor,
        invoiceNumber,
        totalAmount: out.totalAmount,
        creditAccount,
        description: out.summary?.trim() || null,
        ocrModel: model,
        ocrRaw: JSON.stringify(out),
        ocrError: out.isReceipt ? null : "領収書として読み取れなかった可能性があります",
        confirmedAt: null,
        confirmedById: null,
        lines: { create: lines.map((l, i) => ({ ...l, sortOrder: i })) },
      },
    }),
  ]);
  revalidate();
  return { ok: true };
}

function normalizeInvoice(s: string | null | undefined): string | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  return digits.length === 13 ? `T${digits}` : null;
}

// ───────────────────────── 確認・修正 ─────────────────────────

const saveSchema = z.object({
  id: z.string().min(1),
  receiptDate: z.string().trim(),
  vendor: z.string().trim().max(100),
  invoiceNumber: z.string().trim().max(20),
  totalAmount: z.number().int().nullable(),
  creditAccount: z.string().trim().min(1, "支払い方法（貸方）を選んでください").max(30),
  description: z.string().trim().max(200),
  lines: z
    .array(
      z.object({
        account: z.string().trim().min(1, "勘定科目を入れてください").max(30),
        taxCategory: z.string().trim().min(1, "税区分を選んでください").max(30),
        amount: z.number().int(),
      }),
    )
    .min(1, "金額の行を1つ以上入れてください")
    .max(20),
  confirm: z.boolean(),
});

export type SaveReceiptInput = z.input<typeof saveSchema>;

export async function saveReceipt(input: SaveReceiptInput): Promise<Result> {
  const me = await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const d = parsed.data;

  const r = await db.receipt.findUnique({ where: { id: d.id }, select: { exportId: true } });
  if (!r) return { error: "領収書が見つかりません" };
  if (r.exportId) return { error: "出力済みのため直せません。先にこの回の出力を取り消してください" };

  const receiptDate = d.receiptDate ? d.receiptDate : null;
  if (receiptDate && !isDateKey(receiptDate)) return { error: "日付が正しくありません" };
  if (d.confirm) {
    if (!receiptDate) return { error: "日付を入れてください（月ごとの並びとCSVに使います）" };
    if (d.lines.some((l) => l.amount <= 0)) return { error: "金額が0円以下の行があります" };
    const sum = d.lines.reduce((s, l) => s + l.amount, 0);
    if (d.totalAmount != null && sum !== d.totalAmount) {
      return { error: `明細の合計（${yen(sum)}）が領収書の合計（${yen(d.totalAmount)}）と合いません` };
    }
  }
  const invoiceNumber = d.invoiceNumber ? normalizeInvoice(d.invoiceNumber) : null;
  if (d.invoiceNumber && !invoiceNumber) return { error: "登録番号は T と13桁の数字で入れてください" };

  await db.$transaction([
    db.receiptLine.deleteMany({ where: { receiptId: d.id } }),
    db.receipt.update({
      where: { id: d.id },
      data: {
        status: d.confirm ? "CONFIRMED" : "REVIEW",
        receiptDate,
        vendor: d.vendor || null,
        invoiceNumber,
        totalAmount: d.totalAmount,
        creditAccount: d.creditAccount,
        description: d.description || null,
        confirmedAt: d.confirm ? new Date() : null,
        confirmedById: d.confirm ? me.id : null,
        ocrError: d.confirm ? null : undefined,
        lines: {
          create: d.lines.map((l, i) => ({
            account: l.account,
            taxCategory: l.taxCategory,
            amount: l.amount,
            sortOrder: i,
          })),
        },
      },
    }),
  ]);
  revalidate();
  revalidatePath(`/receipts/${d.id}`);
  return { ok: true };
}

/** 確認済みを「要確認」に戻す（出力前のみ） */
export async function unconfirmReceipt(id: string): Promise<Result> {
  await requireAdmin();
  const r = await db.receipt.findUnique({ where: { id }, select: { exportId: true, status: true } });
  if (!r) return { error: "領収書が見つかりません" };
  if (r.exportId) return { error: "出力済みのため戻せません。先にこの回の出力を取り消してください" };
  await db.receipt.update({
    where: { id },
    data: { status: "REVIEW", confirmedAt: null, confirmedById: null },
  });
  revalidate();
  revalidatePath(`/receipts/${id}`);
  return { ok: true };
}

/** 削除（ごみ箱へ。30日間戻せる） */
export async function deleteReceipt(id: string): Promise<Result> {
  const me = await requireAdmin();
  const r = await db.receipt.findUnique({
    where: { id },
    select: { receiptDate: true, vendor: true, totalAmount: true, createdAt: true },
  });
  if (!r) return { error: "領収書が見つかりません" };
  let blobPaths: string[] = [];
  try {
    await db.$transaction(
      async (tx) => {
        const snapshot = await snapshotGraph(tx, "Receipt", id);
        blobPaths = snapshotBlobPaths(snapshot);
        await putInTrash(tx, {
          kind: "RECEIPT",
          label: `領収書 ${duplicateLabel(r)}`,
          snapshot,
          deletedById: me.id,
        });
        await tx.receipt.delete({ where: { id } });
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    console.error("deleteReceipt failed:", e);
    return { error: "削除に失敗しました。時間をおいて再度お試しください" };
  }
  await deleteBlobPaths(blobPaths);
  revalidate();
  revalidatePath("/trash");
  return { ok: true };
}

// ───────────────────────── CSV 出力 ─────────────────────────

export type ExportResult = { ok: true; exportId: string; count: number } | { error: string };

/** 確認済み・未出力のものをまとめて CSV にし、「第N回」として出力済みの印を付ける */
export async function exportReceipts(): Promise<ExportResult> {
  const me = await requireAdmin();
  try {
    const result = await db.$transaction(
      async (tx) => {
        const targets = await tx.receipt.findMany({
          where: { status: "CONFIRMED", exportId: null, receiptDate: { not: null } },
          orderBy: [{ receiptDate: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            receiptDate: true,
            vendor: true,
            description: true,
            creditAccount: true,
            lines: { orderBy: { sortOrder: "asc" }, select: { account: true, taxCategory: true, amount: true } },
          },
        });
        const usable = targets.filter((t) => t.lines.length > 0);
        if (usable.length === 0) return { error: "出力できる領収書（確認済み・未出力）がありません" } as const;

        const last = await tx.receiptExport.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
        const seq = (last?.seq ?? 0) + 1;
        const csv = buildMfCsv(
          usable.map((t) => ({
            receiptDate: t.receiptDate as string,
            vendor: t.vendor,
            description: t.description,
            creditAccount: t.creditAccount,
            lines: t.lines,
          })),
          `領収書読取 第${seq}回`,
        );
        const total = usable.reduce((s, t) => s + t.lines.reduce((a, l) => a + l.amount, 0), 0);
        const exp = await tx.receiptExport.create({
          data: {
            seq,
            count: usable.length,
            totalAmount: total,
            fileName: `MF仕訳_領収書_第${seq}回_${jstDateKey().replace(/-/g, "")}.csv`,
            csv,
            createdById: me.id,
          },
          select: { id: true },
        });
        const updated = await tx.receipt.updateMany({
          where: { id: { in: usable.map((t) => t.id) }, exportId: null, status: "CONFIRMED" },
          data: { exportId: exp.id },
        });
        // 同時に別の人が出力していたら、二重に出さないよう取りやめる
        if (updated.count !== usable.length) throw new Error("CONFLICT");
        return { ok: true as const, exportId: exp.id, count: usable.length };
      },
      { timeout: 30_000 },
    );
    revalidate();
    return result;
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "P2002" || (e instanceof Error && e.message === "CONFLICT")) {
      return { error: "ほかの人が同時に出力しました。画面を更新して確認してください" };
    }
    console.error("exportReceipts failed:", e);
    return { error: "出力に失敗しました。時間をおいて再度お試しください" };
  }
}

/** 出力の取り消し（MF への取り込みをやめた・やり直すとき）。その回の領収書は未出力に戻る */
export async function cancelExport(exportId: string): Promise<Result> {
  await requireAdmin();
  try {
    await db.$transaction([
      db.receipt.updateMany({ where: { exportId }, data: { exportId: null } }),
      db.receiptExport.delete({ where: { id: exportId } }),
    ]);
  } catch {
    return { error: "取り消せませんでした。画面を更新して確認してください" };
  }
  revalidate();
  return { ok: true };
}
