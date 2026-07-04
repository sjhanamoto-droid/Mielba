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

const orderSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
});

const nextProcessSchema = z.object({
  content: z.string().optional().nullable(),
  vendors: z.string().optional().nullable(),
  supplyDeliveryDate: z.string().optional().nullable(),
});

const reportSchema = z
  .object({
    siteId: z.string().min(1, "現場が指定されていません"),
    workDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "作業日を入力してください"),
    startTime: z.string().min(1, "開始時刻を入力してください"),
    endTime: z.string().min(1, "終了時刻を入力してください"),
    detail: z.string().optional(),
    aiSummary: z.string().optional(),
    memo: z.string().optional(),
    handover: z.string().optional(),
    parkingFee: z.string().optional(),
    status: z.enum(["DRAFT", "SUBMITTED"]),
  })
  .superRefine((v, ctx) => {
    // 下書きは detail 空でも保存可。提出時のみ必須（Top10 #4）
    if (v.status === "SUBMITTED" && (!v.detail || v.detail.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["detail"],
        message: "提出には作業内容の入力が必要です",
      });
    }
    if (v.parkingFee && v.parkingFee.trim() !== "") {
      const n = Number(v.parkingFee);
      if (!Number.isInteger(n) || n < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["parkingFee"],
          message: "駐車場代は0以上の整数で入力してください",
        });
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

/** 'YYYY-MM-DD' のみ Date に変換（不正・空は null） */
function dateOrNull(v: string | null): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return dateFromKey(v);
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

// ネスト配列（材料・発注・次回工程・写真・カレンダー）の保存を共通化
async function writeNested(
  tx: Prisma.TransactionClient,
  reportId: string,
  siteId: string,
  status: string,
  formData: FormData,
  photos: ParsedPhotosField,
) {
  const materials = parseJson<z.infer<typeof materialSchema>>(formData.get("materials"))
    .filter((m) => m && typeof m.name === "string" && m.name.trim() !== "");
  const orders = parseJson<z.infer<typeof orderSchema>>(formData.get("orders"))
    .filter((o) => o && typeof o.name === "string" && o.name.trim() !== "");
  const nextProcesses = parseJson<z.infer<typeof nextProcessSchema>>(formData.get("nextProcesses"))
    .filter((p) => p && (clean(p.content) || clean(p.vendors) || clean(p.supplyDeliveryDate)));

  // 既存の子レコード・日報由来イベントを作り直し（重複防止）
  await tx.materialUse.deleteMany({ where: { reportId } });
  await tx.materialOrder.deleteMany({ where: { reportId } });
  await tx.nextProcess.deleteMany({ where: { reportId } });
  await tx.calendarEvent.deleteMany({ where: { reportId } });

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

  if (orders.length > 0) {
    await tx.materialOrder.createMany({
      data: orders.map((o) => ({
        reportId,
        name: o.name.trim(),
        quantity: clean(o.quantity),
        supplier: clean(o.supplier),
        deliveryDate: dateOrNull(clean(o.deliveryDate)),
      })),
    });
  }

  if (nextProcesses.length > 0) {
    await tx.nextProcess.createMany({
      data: nextProcesses.map((p) => ({
        reportId,
        content: clean(p.content),
        vendors: clean(p.vendors),
        supplyDeliveryDate: dateOrNull(clean(p.supplyDeliveryDate)),
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

  // ── カレンダー反映（提出時のみ） §4.3 ──
  if (status === "SUBMITTED") {
    const events: {
      siteId: string;
      title: string;
      date: Date;
      source: string;
      reportId: string;
    }[] = [];

    for (const o of orders) {
      const date = dateOrNull(clean(o.deliveryDate));
      if (date) {
        events.push({
          siteId,
          title: `${o.name.trim()} 配達`,
          date,
          source: "DELIVERY",
          reportId,
        });
      }
    }
    for (const p of nextProcesses) {
      const date = dateOrNull(clean(p.supplyDeliveryDate));
      if (date) {
        events.push({
          siteId,
          title: "支給品納品",
          date,
          source: "SUPPLY",
          reportId,
        });
      }
    }
    if (events.length > 0) {
      await tx.calendarEvent.createMany({ data: events });
    }
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
    detail: formData.get("detail") || undefined,
    aiSummary: formData.get("aiSummary") || undefined,
    memo: formData.get("memo") || undefined,
    handover: formData.get("handover") || undefined,
    parkingFee: formData.get("parkingFee") || undefined,
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

  const parkingFee = clean(d.parkingFee) ? Number(d.parkingFee) : null;

  const data = {
    detail: clean(d.detail),
    aiSummary: clean(d.aiSummary),
    memo: clean(d.memo),
    handover: clean(d.handover),
    parkingFee,
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

      // 確定した rep.id に対して子レコード・カレンダーイベントを再生成する
      await writeNested(tx, rep.id, d.siteId, d.status, formData, photos);

      // 提出時に引き継ぎ事項（Handover）を起票・更新する
      if (d.status === "SUBMITTED") {
        await syncHandover(tx, rep.id, d.siteId, userId, clean(d.handover));
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
