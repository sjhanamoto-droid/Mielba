"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { assistReport, type AiAssist } from "@/lib/ai";

// ───────────────────────── AIサポート（§4.3.3） ─────────────────────────
// クライアント（ai-assist-panel）から呼ぶ。@/lib/ai の決定論的エンジンに委譲。
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

const photoSchema = z.object({
  dataUrl: z.string().min(1),
  caption: z.string().optional().nullable(),
  kind: z.string().optional().nullable(),
  isVideo: z.boolean().optional(),
  width: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
});

const reportSchema = z.object({
  siteId: z.string().min(1, "現場が指定されていません"),
  workDate: z.string().min(1, "作業日を入力してください"),
  startTime: z.string().min(1, "開始時刻を入力してください"),
  endTime: z.string().min(1, "終了時刻を入力してください"),
  detail: z.string().optional(),
  aiSummary: z.string().optional(),
  memo: z.string().optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]),
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
  revalidatePath("/calendar");
  revalidatePath(`/sites/${siteId}`);
  revalidatePath(`/sites/${siteId}/reports`);
  if (reportId) revalidatePath(`/reports/${reportId}`);
}

type ParsedReport = z.infer<typeof reportSchema>;

// ネスト配列の保存 + 提出時のカレンダー反映を共通化
async function writeNested(
  reportId: string,
  siteId: string,
  status: string,
  formData: FormData,
) {
  const materials = parseJson<z.infer<typeof materialSchema>>(formData.get("materials"))
    .filter((m) => m && typeof m.name === "string" && m.name.trim() !== "");
  const orders = parseJson<z.infer<typeof orderSchema>>(formData.get("orders"))
    .filter((o) => o && typeof o.name === "string" && o.name.trim() !== "");
  const nextProcesses = parseJson<z.infer<typeof nextProcessSchema>>(formData.get("nextProcesses"))
    .filter((p) => p && (clean(p.content) || clean(p.vendors) || clean(p.supplyDeliveryDate)));
  const photos = parseJson<z.infer<typeof photoSchema>>(formData.get("photos"))
    .filter((p) => p && typeof p.dataUrl === "string" && p.dataUrl !== "");

  // 既存の子レコード・日報由来イベントを作り直し（重複防止）
  await db.materialUse.deleteMany({ where: { reportId } });
  await db.materialOrder.deleteMany({ where: { reportId } });
  await db.nextProcess.deleteMany({ where: { reportId } });
  await db.photo.deleteMany({ where: { reportId } });
  await db.calendarEvent.deleteMany({ where: { reportId } });

  if (materials.length > 0) {
    await db.materialUse.createMany({
      data: materials.map((m) => ({
        reportId,
        name: m.name.trim(),
        quantity: clean(m.quantity),
        unit: clean(m.unit),
      })),
    });
  }

  if (orders.length > 0) {
    await db.materialOrder.createMany({
      data: orders.map((o) => ({
        reportId,
        name: o.name.trim(),
        quantity: clean(o.quantity),
        supplier: clean(o.supplier),
        deliveryDate: clean(o.deliveryDate) ? new Date(o.deliveryDate as string) : null,
      })),
    });
  }

  if (nextProcesses.length > 0) {
    await db.nextProcess.createMany({
      data: nextProcesses.map((p) => ({
        reportId,
        content: clean(p.content),
        vendors: clean(p.vendors),
        supplyDeliveryDate: clean(p.supplyDeliveryDate)
          ? new Date(p.supplyDeliveryDate as string)
          : null,
      })),
    });
  }

  if (photos.length > 0) {
    await db.photo.createMany({
      data: photos.map((p) => ({
        reportId,
        dataUrl: p.dataUrl,
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
      if (clean(o.deliveryDate)) {
        events.push({
          siteId,
          title: `${o.name.trim()} 配達`,
          date: new Date(o.deliveryDate as string),
          source: "DELIVERY",
          reportId,
        });
      }
    }
    for (const p of nextProcesses) {
      if (clean(p.supplyDeliveryDate)) {
        events.push({
          siteId,
          title: "支給品納品",
          date: new Date(p.supplyDeliveryDate as string),
          source: "SUPPLY",
          reportId,
        });
      }
    }
    if (events.length > 0) {
      await db.calendarEvent.createMany({ data: events });
    }
  }
}

async function persist(
  formData: FormData,
  userId: string,
  reportId?: string | null,
) {
  const parsed = reportSchema.safeParse({
    siteId: formData.get("siteId"),
    workDate: formData.get("workDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    detail: formData.get("detail") || undefined,
    aiSummary: formData.get("aiSummary") || undefined,
    memo: formData.get("memo") || undefined,
    status: formData.get("status") || "DRAFT",
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message };
  }
  const d: ParsedReport = parsed.data;
  const workDate = new Date(d.workDate);

  const data = {
    detail: clean(d.detail),
    aiSummary: clean(d.aiSummary),
    memo: clean(d.memo),
    startTime: d.startTime,
    endTime: d.endTime,
    status: d.status,
    submittedAt: d.status === "SUBMITTED" ? new Date() : null,
  };

  let report;
  if (reportId) {
    // 編集時は id で直接更新する（workDate を変えても複合キーで別レコードに
    // upsert されて日報が分裂するのを防ぐ）。workDate を含む全項目を更新。
    report = await db.dailyReport.update({
      where: { id: reportId },
      data: { workDate, ...data },
    });
  } else {
    // @@unique([siteId, userId, workDate]) なので新規は upsert で重複時に上書き
    report = await db.dailyReport.upsert({
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

  // 確定した report.id に対して子レコード・カレンダーイベントを再生成する
  await writeNested(report.id, d.siteId, d.status, formData);

  revalidateReport(report.id, d.siteId);
  return { ok: true, id: report.id };
}

export async function createReport(formData: FormData) {
  const user = await requireUser();
  const result = await persist(formData, user.id);
  if ("error" in result && result.error) return { error: result.error };
  redirect(`/reports/${result.id}`);
}

export async function updateReport(formData: FormData) {
  const user = await requireUser();

  // 認可: 本人または管理者のみ更新可
  const reportIdRaw = formData.get("reportId");
  const reportId = typeof reportIdRaw === "string" && reportIdRaw ? reportIdRaw : null;
  if (reportId) {
    const existing = await db.dailyReport.findUnique({
      where: { id: reportId },
      select: { userId: true },
    });
    if (!existing) {
      return { error: "日報が見つかりません" };
    }
    if (existing.userId !== user.id && !isAdmin(user)) {
      return { error: "編集権限がありません" };
    }
  }

  // 編集時は reportId を渡し、id で直接更新する（workDate 変更時の分裂を防ぐ）
  const result = await persist(formData, user.id, reportId);
  if ("error" in result && result.error) return { error: result.error };
  redirect(`/reports/${result.id}`);
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
  await db.comment.create({
    data: {
      reportId: parsed.data.reportId,
      userId: user.id,
      body: parsed.data.body.trim(),
    },
  });
  revalidatePath(`/reports/${parsed.data.reportId}`);
  return { ok: true };
}

export async function deleteReport(id: string) {
  const user = await requireUser();
  const report = await db.dailyReport.findUnique({
    where: { id },
    select: { userId: true, siteId: true },
  });
  if (!report) return { error: "日報が見つかりません" };
  if (report.userId !== user.id && !isAdmin(user)) {
    return { error: "削除権限がありません" };
  }
  await db.dailyReport.delete({ where: { id } });
  revalidateReport(null, report.siteId);
  redirect(`/sites/${report.siteId}/reports`);
}
