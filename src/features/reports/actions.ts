"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { assistReport, type AiAssist } from "@/lib/ai";
import { dateFromKey } from "@/lib/date";
import { parseAndValidatePhotosField, type ParsedPhotosField } from "@/lib/photos";

// ───────────────────────── AIサポート（§4.3.3） ─────────────────────────
// クライアント（ai-assist-panel）から呼ぶローカル即時チェック。
// 実LLM接続は features/reports/ai-actions.ts の aiAssistLlm を使う。
export async function assistReportAction(
  detail: string,
  hasMaterials: boolean,
  hasPhotos: boolean,
): Promise<AiAssist> {
  await requireUser();
  return assistReport({ detail: detail || "", hasMaterials, hasPhotos });
}

// ───────────────────────── スキーマ ─────────────────────────
const materialSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
});

// 経費（駐車場代以外の「＋追加」分）。amount は文字列/数値どちらも許容し、保存時に整数化する。
const expenseSchema = z.object({
  label: z.string(),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
});

const reportSchema = z
  .object({
    siteId: z.string().min(1, "現場が指定されていません"),
    workDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "作業日を入力してください"),
    startTime: z.string().min(1, "開始時刻を入力してください"),
    endTime: z.string().min(1, "終了時刻を入力してください"),
    aiDraft: z.string().optional(),
    detail: z.string().optional(),
    aiSummary: z.string().optional(),
    handover: z.string().optional(),
    handoverChoice: z.enum(["HAS", "NONE"]).optional(),
    parkingFee: z.string().optional(),
    parkingFeeChoice: z.enum(["HAS", "NONE"]).optional(),
    trainFare: z.string().optional(),
    trainFareChoice: z.enum(["HAS", "NONE"]).optional(),
    timeChangeReason: z.string().optional(),
    stockChoice: z.enum(["HAS", "NONE"]).optional(),
    stockNote: z.string().optional(),
    // メインの人以外は材料・在庫欄がロックされ "1" が送られる（在庫必須をスキップ）
    materialsLocked: z.string().optional(),
    status: z.enum(["DRAFT", "SUBMITTED"]),
  })
  .superRefine((v, ctx) => {
    const submitted = v.status === "SUBMITTED";
    const err = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    // 0以上の整数かどうか（金額の共通チェック）
    const isNonNegInt = (s: string | undefined) => {
      if (!s || s.trim() === "") return false;
      const n = Number(s);
      return Number.isInteger(n) && n >= 0;
    };

    // 下書きは detail 空でも保存可。提出時のみ必須（Top10 #4）
    if (submitted && (!v.detail || v.detail.trim() === "")) {
      err("detail", "提出には作業内容の入力が必要です");
    }

    // 引き継ぎ あり/なし（提出時必須）
    if (submitted) {
      if (!v.handoverChoice) {
        err("handover", "引き継ぎのあり/なしを選択してください");
      } else if (v.handoverChoice === "HAS" && (!v.handover || v.handover.trim() === "")) {
        err("handover", "引き継ぎ内容を入力してください（無い場合は「なし」を選択）");
      }
    }

    // 駐車場代 あり/なし（提出時必須。あり→0以上整数）
    if (submitted) {
      if (!v.parkingFeeChoice) {
        err("parkingFee", "駐車場代のあり/なしを選択してください");
      } else if (v.parkingFeeChoice === "HAS" && !isNonNegInt(v.parkingFee)) {
        err("parkingFee", "駐車場代は0以上の整数で入力してください");
      }
    } else if (v.parkingFee && v.parkingFee.trim() !== "" && !isNonNegInt(v.parkingFee)) {
      // 下書きでも数値が入っていれば整数チェック（従来動作）
      err("parkingFee", "駐車場代は0以上の整数で入力してください");
    }

    // 電車賃 あり/なし（提出時必須。あり→0以上整数）
    if (submitted) {
      if (!v.trainFareChoice) {
        err("trainFare", "電車賃のあり/なしを選択してください");
      } else if (v.trainFareChoice === "HAS" && !isNonNegInt(v.trainFare)) {
        err("trainFare", "電車賃は0以上の整数で入力してください");
      }
    } else if (v.trainFare && v.trainFare.trim() !== "" && !isNonNegInt(v.trainFare)) {
      err("trainFare", "電車賃は0以上の整数で入力してください");
    }

    // 時間変更理由（8:00-17:00 以外のとき提出時必須）
    if (submitted && (v.startTime !== "08:00" || v.endTime !== "17:00")) {
      if (!v.timeChangeReason || v.timeChangeReason.trim() === "") {
        err("timeChangeReason", "8:00〜17:00 以外の作業になった理由を入力してください");
      }
    }

    // 在庫材料 あり/なし（提出時必須。あり→内容必須）
    // メインの人以外（materialsLocked）は在庫欄を持たないため必須チェックをスキップ
    if (submitted && v.materialsLocked !== "1") {
      if (!v.stockChoice) {
        err("stockNote", "在庫材料の使用有無を選択してください");
      } else if (v.stockChoice === "HAS" && (!v.stockNote || v.stockNote.trim() === "")) {
        err("stockNote", "使用した在庫材料の内容を入力してください");
      }
    }
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

function revalidateReport(reportId: string | null, siteId: string) {
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/calendar");
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/reports`);
  if (reportId) revalidatePath(`/reports/${reportId}`);
}

type ParsedReport = z.infer<typeof reportSchema>;

export type ReportActionError = {
  error: string;
  /** フィールド単位のエラー（Field の error prop にマッピングする） */
  fieldErrors?: Record<string, string>;
};

const GENERIC_ERROR =
  "保存に失敗しました。電波状況を確認してもう一度お試しください（入力内容は端末に自動保存されています）。";

// ネスト配列（使用材料・写真）の保存を共通化する。
// 第1弾で発注(MaterialOrder)・次回工程(NextProcess)・注意点メモ(memo)はフォームから撤去した。
// 既存DBデータを壊さないため、それらの子レコードやカレンダーイベントは削除・再生成しない（残置）。
async function writeNested(
  tx: Prisma.TransactionClient,
  reportId: string,
  formData: FormData,
  photos: ParsedPhotosField,
  skipMaterials = false,
) {
  // メインの人以外（materialsLocked）は材料を書き込まない（空扱い）
  const materials = skipMaterials
    ? []
    : parseJson<z.infer<typeof materialSchema>>(formData.get("materials"))
        .filter((m) => m && typeof m.name === "string" && m.name.trim() !== "");

  // 経費（駐車場代以外）。label が非空 かつ amount が有効な整数の行のみ採用する。
  const expenses = parseJson<z.infer<typeof expenseSchema>>(formData.get("expenses"))
    .map((e) => ({
      label: typeof e?.label === "string" ? e.label.trim() : "",
      amount: Math.trunc(Number(e?.amount)),
    }))
    .filter((e) => e.label !== "" && Number.isFinite(e.amount) && e.amount >= 0);

  // 使用材料・経費は作り直し（重複防止）。発注・次回工程・カレンダーは残置。
  await tx.materialUse.deleteMany({ where: { reportId } });
  await tx.reportExpense.deleteMany({ where: { reportId } });

  // 写真は全削除→再作成をやめ、kept に無い既存のみ削除・新規のみ作成
  await tx.photo.deleteMany({
    where: {
      reportId,
      ...(photos.kept.length > 0 ? { id: { notIn: photos.kept } } : {}),
    },
  });

  if (materials.length > 0) {
    await tx.materialUse.createMany({
      data: materials.map((m) => ({
        reportId,
        name: m.name.trim(),
        quantity: clean(m.quantity),
        unit: clean(m.unit),
      })),
    });
  }

  if (expenses.length > 0) {
    await tx.reportExpense.createMany({
      data: expenses.map((e, i) => ({
        reportId,
        label: e.label,
        amount: e.amount,
        sortOrder: i,
      })),
    });
  }

  if (photos.added.length > 0) {
    await tx.photo.createMany({
      data: photos.added.map((p) => ({
        reportId,
        dataUrl: p.dataUrl,
        thumbUrl: p.thumbUrl ?? null,
        caption: clean(p.caption),
        kind: clean(p.kind) ?? "WORK",
        isVideo: Boolean(p.isVideo),
        width: typeof p.width === "number" ? p.width : null,
        height: typeof p.height === "number" ? p.height : null,
      })),
    });
  }
}

// 引き継ぎ事項（Handover）の起票・更新。提出時のみ呼ぶ。
async function syncHandover(
  tx: Prisma.TransactionClient,
  reportId: string,
  siteId: string,
  userId: string,
  content: string | null,
) {
  const existing = await tx.handover.findFirst({
    where: { reportId, resolvedAt: null },
    select: { id: true },
  });
  if (content) {
    if (existing) {
      await tx.handover.update({
        where: { id: existing.id },
        data: { content },
      });
    } else {
      await tx.handover.create({
        data: { siteId, reportId, content, createdById: userId },
      });
    }
  } else if (existing) {
    // 引き継ぎ欄が空で再提出されたら、未解決の起票を取り下げる
    await tx.handover.delete({ where: { id: existing.id } });
  }
}

async function persist(
  formData: FormData,
  userId: string,
  reportId?: string | null,
): Promise<ReportActionError | { ok: true; id: string; status: string }> {
  const parsed = reportSchema.safeParse({
    siteId: formData.get("siteId"),
    workDate: formData.get("workDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    aiDraft: formData.get("aiDraft") || undefined,
    detail: formData.get("detail") || undefined,
    aiSummary: formData.get("aiSummary") || undefined,
    handover: formData.get("handover") || undefined,
    handoverChoice: formData.get("handoverChoice") || undefined,
    parkingFee: formData.get("parkingFee") || undefined,
    parkingFeeChoice: formData.get("parkingFeeChoice") || undefined,
    trainFare: formData.get("trainFare") || undefined,
    trainFareChoice: formData.get("trainFareChoice") || undefined,
    timeChangeReason: formData.get("timeChangeReason") || undefined,
    stockChoice: formData.get("stockChoice") || undefined,
    stockNote: formData.get("stockNote") || undefined,
    materialsLocked: formData.get("materialsLocked") || undefined,
    status: formData.get("status") || "DRAFT",
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) {
      if (v && v[0]) fieldErrors[k] = v[0];
    }
    return {
      error: parsed.error.errors[0]?.message ?? "入力内容を確認してください",
      fieldErrors,
    };
  }
  const d: ParsedReport = parsed.data;
  const workDate = dateFromKey(d.workDate);

  // 写真（hidden JSON）のサーバー側検証：既存={id} / 新規={dataUrl,...}
  const photosRaw = formData.get("photos");
  const photos = parseAndValidatePhotosField(
    typeof photosRaw === "string" ? photosRaw : "",
  );
  if ("error" in photos) {
    return { error: photos.error };
  }

  // 「なし」選択は0円で記録。あり/未選択は入力値（無ければ null）。
  const parkingFee =
    d.parkingFeeChoice === "NONE" ? 0 : clean(d.parkingFee) ? Number(d.parkingFee) : null;
  const trainFare =
    d.trainFareChoice === "NONE" ? 0 : clean(d.trainFare) ? Number(d.trainFare) : null;
  // 引き継ぎ「なし」は本文を消して handoverNone を立てる
  const handoverContent = d.handoverChoice === "NONE" ? null : clean(d.handover);

  // メインの人以外は材料・在庫を持たない（在庫は null 固定・材料は書き込まない）
  const materialsLocked = d.materialsLocked === "1";

  const data = {
    aiDraft: clean(d.aiDraft),
    detail: clean(d.detail),
    aiSummary: clean(d.aiSummary),
    handover: handoverContent,
    handoverNone: d.handoverChoice === "NONE",
    parkingFee,
    trainFare,
    timeChangeReason: clean(d.timeChangeReason),
    // 未選択（下書き）は null、あり=true、なし=false。ロック時は常に null。
    stockUsed: materialsLocked ? null : d.stockChoice ? d.stockChoice === "HAS" : null,
    stockNote: materialsLocked ? null : d.stockChoice === "HAS" ? clean(d.stockNote) : null,
    startTime: d.startTime,
    endTime: d.endTime,
    status: d.status,
    submittedAt: d.status === "SUBMITTED" ? new Date() : null,
  };

  let savedId: string;
  try {
    // 途中失敗で材料・写真が消える事故を防ぐため、一連の書き込みをアトミックに
    const report = await db.$transaction(async (tx) => {
      let rep;
      if (reportId) {
        // 編集時は id で直接更新する（workDate を変えても複合キーで別レコードに
        // upsert されて日報が分裂するのを防ぐ）。workDate を含む全項目を更新。
        rep = await tx.dailyReport.update({
          where: { id: reportId },
          data: { workDate, ...data },
        });
      } else {
        // @@unique([siteId, userId, workDate]) なので新規は upsert で重複時に上書き
        rep = await tx.dailyReport.upsert({
          where: {
            siteId_userId_workDate: { siteId: d.siteId, userId, workDate },
          },
          create: {
            siteId: d.siteId,
            userId,
            workDate,
            ...data,
          },
          update: data,
        });
      }

      // 確定した rep.id に対して使用材料・写真を再生成する
      await writeNested(tx, rep.id, formData, photos, materialsLocked);

      // 提出時に引き継ぎ事項（Handover）を起票・更新する（「なし」は取り下げ）
      if (d.status === "SUBMITTED") {
        await syncHandover(tx, rep.id, d.siteId, userId, handoverContent);
      }

      return rep;
    });
    savedId = report.id;
  } catch (e) {
    console.error("[reports] 保存エラー:", e);
    return { error: GENERIC_ERROR };
  }

  revalidateReport(savedId, d.siteId);
  return { ok: true, id: savedId, status: d.status };
}

function successToast(status: string): string {
  return status === "SUBMITTED" ? "日報を提出しました" : "下書きを保存しました";
}

export async function createReport(formData: FormData) {
  const user = await requireUser();
  const result = await persist(formData, user.id);
  if ("error" in result) return result;
  redirect(`/reports/${result.id}?toast=${encodeURIComponent(successToast(result.status))}`);
}

export async function updateReport(formData: FormData) {
  const user = await requireUser();

  // 認可: 本人または管理者のみ更新可
  const reportIdRaw = formData.get("reportId");
  const reportId = typeof reportIdRaw === "string" && reportIdRaw ? reportIdRaw : null;
  if (reportId) {
    let existing;
    try {
      existing = await db.dailyReport.findUnique({
        where: { id: reportId },
        select: { userId: true },
      });
    } catch (e) {
      console.error("[reports] 認可チェックエラー:", e);
      return { error: GENERIC_ERROR };
    }
    if (!existing) {
      return { error: "日報が見つかりません" };
    }
    if (existing.userId !== user.id && !isAdmin(user)) {
      return { error: "編集権限がありません" };
    }
  }

  // 編集時は reportId を渡し、id で直接更新する（workDate 変更時の分裂を防ぐ）
  const result = await persist(formData, user.id, reportId);
  if ("error" in result) return result;
  redirect(`/reports/${result.id}?toast=${encodeURIComponent(successToast(result.status))}`);
}

// ───────────────────────── コメント（§4.3.4） ─────────────────────────
const commentSchema = z.object({
  reportId: z.string().min(1),
  body: z.string().min(1, "コメントを入力してください"),
});

export async function addComment(formData: FormData) {
  const user = await requireUser();
  const parsed = commentSchema.safeParse({
    reportId: formData.get("reportId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  try {
    await db.comment.create({
      data: {
        reportId: parsed.data.reportId,
        userId: user.id,
        body: parsed.data.body.trim(),
      },
    });
  } catch (e) {
    console.error("[reports] コメント保存エラー:", e);
    return { error: "コメントの送信に失敗しました。電波状況を確認してもう一度お試しください。" };
  }
  revalidatePath(`/reports/${parsed.data.reportId}`);
  return { ok: true };
}

export async function deleteReport(id: string) {
  const user = await requireUser();
  let report;
  try {
    report = await db.dailyReport.findUnique({
      where: { id },
      select: { userId: true, siteId: true },
    });
  } catch (e) {
    console.error("[reports] 削除エラー:", e);
    return { error: GENERIC_ERROR };
  }
  if (!report) return { error: "日報が見つかりません" };
  if (report.userId !== user.id && !isAdmin(user)) {
    return { error: "削除権限がありません" };
  }
  try {
    await db.dailyReport.delete({ where: { id } });
  } catch (e) {
    console.error("[reports] 削除エラー:", e);
    return { error: "削除に失敗しました。もう一度お試しください。" };
  }
  revalidateReport(null, report.siteId);
  redirect(`/sites/${report.siteId}/reports`);
}
