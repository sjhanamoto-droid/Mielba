"use server";

// 現場のAI分析（人工超過・工事完了の振り返り）。
// 現場情報と提出済み日報の全文をまとめて Claude に渡し、
// 「〜ではないか」という仮説と改善提案の形で分析を返す。
// 結果は Site に保存し（最新のみ）、再分析で上書きする。
// 金額情報（単価・見積・経費など）はプロンプトに含めない（閲覧権限と分離するため）。

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { storedDateKey } from "@/lib/date";
import {
  PROJECT_TYPE_LABEL,
  SITE_STAGES,
  siteStageIndex,
  type ProjectType,
} from "@/lib/constants";

export type SiteAnalysisType = "OVERRUN" | "COMPLETION";

export type SiteAnalysisResult =
  | { ok: true; analysis: string; analyzedAt: string }
  | { error: string };

const OVERRUN_SYSTEM = [
  "あなたは建設会社（電気工事）の工事アナリストです。",
  "目標人工（予定工数）を超過した現場について、現場情報と日報の記録から超過の原因を分析します。",
  "出力は日本語で、次の構成にしてください（見出しは【】で囲む）。",
  "【超過の概況】目標人工と実績人工、超過幅を1〜2文でまとめる。",
  "【考えられる原因】日報の記述を根拠に「〜が原因ではないか」という仮説を2〜5個。各仮説には根拠となる日報の日付や記述を添える。",
  "【改善の提案】次の現場で同じ超過を防ぐための具体的な提案を2〜4個。",
  "注意: 断定せず仮説として提示する。日報に書かれていないことを創作しない。",
  "スタッフ個人を責める表現は避け、段取り・工程・情報共有など仕組みの観点で書く。",
].join("\n");

const COMPLETION_SYSTEM = [
  "あなたは建設会社（電気工事）の工事アナリストです。",
  "完了した工事を振り返り、次の工事に活かすための分析を行います。",
  "出力は日本語で、次の構成にしてください（見出しは【】で囲む）。",
  "【工事の総括】工期・人工・作業の流れを2〜3文でまとめる。",
  "【うまくいった点】日報から読み取れる良かった点を1〜3個。",
  "【課題・気づき】問題・手戻り・待ち時間・段取り不足などを、日報の日付や記述を根拠に「〜ではないか」という仮説として2〜4個。",
  "【次の工事への提案】具体的な改善提案を2〜4個。",
  "注意: 日報に書かれていないことを創作しない。スタッフ個人を責める表現は避け、仕組みの観点で書く。",
].join("\n");

/** 長文を切り詰める（プロンプト肥大でトークン超過しないように） */
function clip(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max) + "…";
}

function fmtD(d: Date | null): string {
  return d ? storedDateKey(d) : "未設定";
}

/** 現場＋日報を分析用テキストにまとめる（金額情報は含めない） */
async function buildContext(siteId: string): Promise<
  | { error: string }
  | { text: string; site: { targetManDays: number | null } }
> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    include: { customer: { select: { name: true } } },
  });
  if (!site) return { error: "現場が見つかりません" };

  const [reports, manDaysCount, handovers] = await Promise.all([
    db.dailyReport.findMany({
      where: { siteId, status: "SUBMITTED" },
      orderBy: { workDate: "asc" },
      take: 100, // 直近100件まで（1件≒数百トークン想定）
      include: {
        user: { select: { name: true } },
        materials: { select: { name: true, quantity: true, unit: true } },
        stockUses: { select: { name: true, quantity: true, unit: true } },
        _count: { select: { photos: true } },
      },
    }),
    site.actualStartDate
      ? db.dailyReport.count({
          where: {
            siteId,
            status: "SUBMITTED",
            workDate: { gte: site.actualStartDate },
          },
        })
      : Promise.resolve(0),
    db.handover.findMany({
      where: { siteId, resolvedAt: null },
      select: { content: true },
      take: 10,
    }),
  ]);

  if (reports.length === 0) {
    return { error: "提出済みの日報が無いため分析できません" };
  }

  const stage = SITE_STAGES[siteStageIndex(site.siteStatus, site.projectStatus)];
  const lines: string[] = [
    "■現場情報",
    `案件名: ${site.name}`,
    `顧客: ${site.customer.name}`,
    `工事種別: ${PROJECT_TYPE_LABEL[site.projectType as ProjectType] ?? site.projectType}`,
    site.address ? `住所: ${site.address}` : "",
    `進捗段階: ${stage}`,
    `着工: 予定 ${fmtD(site.plannedStartDate)} ／ 実績 ${fmtD(site.actualStartDate)}`,
    `完工: 予定 ${fmtD(site.plannedEndDate)} ／ 実績 ${fmtD(site.actualEndDate)}`,
    `目標人工: ${site.targetManDays ?? "未設定"}`,
    `実績人工: ${manDaysCount}（着工実績日以降の提出済み日報数。1日報＝1人工）`,
    site.handoverNote ? `現場の引き継ぎメモ: ${clip(site.handoverNote, 300)}` : "",
    handovers.length > 0
      ? `未解決の引き継ぎ: ${handovers.map((h) => clip(h.content, 100)).join(" ／ ")}`
      : "",
    "",
    `■日報（時系列・${reports.length}件）`,
  ].filter(Boolean);

  for (const r of reports) {
    const mats = [...r.materials, ...r.stockUses]
      .map((m) => `${m.name}${m.quantity ? ` ${m.quantity}${m.unit ?? ""}` : ""}`)
      .join("、");
    const parts = [
      `- ${storedDateKey(r.workDate)} ${r.user.name} ${r.startTime}〜${r.endTime}`,
      r.detail ? `作業: ${clip(r.detail, 400)}` : "作業内容の記載なし",
      r.timeChangeReason ? `時間変更理由: ${clip(r.timeChangeReason, 150)}` : "",
      r.handover ? `引き継ぎ: ${clip(r.handover, 200)}` : "",
      mats ? `材料: ${clip(mats, 200)}` : "",
      r._count.photos > 0 ? `写真${r._count.photos}枚` : "",
    ].filter(Boolean);
    lines.push(parts.join("｜"));
  }

  return { text: lines.join("\n"), site: { targetManDays: site.targetManDays } };
}

export async function analyzeSite(
  siteId: string,
  type: SiteAnalysisType,
): Promise<SiteAnalysisResult> {
  const user = await requireUser();
  if (!isAdmin(user)) return { error: "分析の実行は管理者のみ可能です" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "AI機能が設定されていません（APIキー未設定）" };

  const ctx = await buildContext(siteId);
  if ("error" in ctx) return ctx;

  const isOverrun = type === "OVERRUN";
  const instruction = isOverrun
    ? "以下の現場は目標人工を超過しました。なぜ超過したのかを分析してください。"
    : "以下の工事が完了しました。この工事を振り返って分析してください。";

  let analysis: string;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 3500,
      system: isOverrun ? OVERRUN_SYSTEM : COMPLETION_SYSTEM,
      messages: [
        { role: "user", content: `${instruction}\n\n${ctx.text}` },
      ],
    });
    analysis = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!analysis) return { error: "AIの分析結果を取得できませんでした" };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[site-analysis] Claude API エラー:", e.status, e.message);
    } else {
      console.error("[site-analysis] 予期しないエラー:", e);
    }
    return { error: "AI分析に失敗しました。時間をおいて再度お試しください。" };
  }

  const analyzedAt = new Date();
  try {
    await db.site.update({
      where: { id: siteId },
      data: isOverrun
        ? { overrunAnalysis: analysis, overrunAnalyzedAt: analyzedAt }
        : { completionAnalysis: analysis, completionAnalyzedAt: analyzedAt },
    });
  } catch (e) {
    console.error("[site-analysis] 保存エラー:", e);
    return { error: "分析結果の保存に失敗しました。もう一度お試しください。" };
  }

  revalidatePath(`/sites/${siteId}`);
  return { ok: true, analysis, analyzedAt: analyzedAt.toISOString() };
}
