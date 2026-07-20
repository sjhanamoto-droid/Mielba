"use server";

// AIサポート（実LLM接続 / Top10 #9）
// ANTHROPIC_API_KEY があれば Claude API（structured outputs）で
// 誤字補正・要約・書き漏れチェックを行い、無い/失敗時は
// 既存のローカル決定論エンジン（src/lib/ai.ts）にフォールバックする。

// zodOutputFormat（SDKヘルパー）は zod/v4 型を要求する（zod 3.25+ が同梱）
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { requireUser } from "@/lib/session";
import { assistReport, type AiAssist } from "@/lib/ai";

const aiAssistSchema = z.object({
  summary: z
    .string()
    .describe("作業内容の要約（100字程度・日本語・「【要約】」で始める）"),
  corrections: z
    .array(
      z.object({
        from: z.string().describe("誤りと思われる元の表記"),
        to: z.string().describe("修正後の表記"),
      }),
    )
    .describe("誤字・変換ミスの補正候補（建設用語を優先）。無ければ空配列"),
  warnings: z
    .array(z.string())
    .describe("書き漏れ・添付漏れの警告（日本語）。無ければ空配列"),
});

const SYSTEM_PROMPT = [
  "あなたは建設現場の日報を校正するアシスタントです。",
  "スタッフがスマホで急いで入力した作業内容テキストを受け取り、次の3点を日本語で返します。",
  "1. corrections: 誤字・変換ミスの補正候補。建設用語（解体/養生/確認/配管/塗装/足場 等）の誤変換を優先して指摘する。原文に無い誤りを作らないこと。",
  "2. summary: 100字程度の要約。必ず「【要約】」というプレフィックスで始める。管理者や次の担当者が状況を素早く把握できるよう、作業内容・進捗・問題点を簡潔にまとめる。",
  "3. warnings: 書き漏れの警告。次の観点で確認する — 不具合・破損の記載があるのに写真が無い / 発注・手配の記載があるのに材料発注欄が未入力 / 次回・明日の予定の記載があるのに次回工程欄が未入力 / 材料を使った記載があるのに使用材料欄が未入力。該当しなければ空配列でよい。",
  "指摘は現場のスタッフに向けた丁寧で簡潔な日本語にすること。",
].join("\n");

export interface AiAssistLlmInput {
  detail: string;
  hasMaterials: boolean;
  hasPhotos: boolean;
}

/** ローカルエンジンの結果に「AI接続失敗」の注記を付けて返す */
function localFallback(input: AiAssistLlmInput, failed: boolean): AiAssist {
  const result = assistReport({
    detail: input.detail || "",
    hasMaterials: input.hasMaterials,
    hasPhotos: input.hasPhotos,
  });
  if (!failed) return result;
  return {
    ...result,
    warnings: [
      "(AI接続に失敗したため簡易チェック結果を表示しています)",
      ...result.warnings,
    ],
  };
}

export async function aiAssistLlm(input: AiAssistLlmInput): Promise<AiAssist> {
  await requireUser();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const detail = (input.detail || "").trim();

  // キー未設定・入力なしは従来のローカルエンジン
  if (!apiKey || detail === "") {
    return localFallback(input, false);
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            "以下の日報の作業内容を校正してください。",
            "",
            "【作業内容】",
            detail,
            "",
            `【使用材料の入力】${input.hasMaterials ? "あり" : "なし"}`,
            `【写真の添付】${input.hasPhotos ? "あり" : "なし"}`,
          ].join("\n"),
        },
      ],
      output_config: {
        format: zodOutputFormat(aiAssistSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      // 安全側の拒否等でスキーマ出力が得られなかった場合
      return localFallback(input, true);
    }

    const summary =
      parsed.summary && !parsed.summary.startsWith("【要約】")
        ? "【要約】" + parsed.summary
        : parsed.summary;

    return {
      summary,
      corrections: parsed.corrections.filter((c) => c.from !== c.to),
      warnings: parsed.warnings,
    };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[ai-assist] Claude API エラー:", e.status, e.message);
    } else {
      console.error("[ai-assist] 予期しないエラー:", e);
    }
    return localFallback(input, true);
  }
}

// ───────────────────── AI下書き → 各項目へ振り分け（第2弾） ─────────────────────
// 現場詳細（aiDraft・箇条書き）を Claude の structured outputs で解析し、
// 作業内容・使用材料・経費・駐車場代・引き継ぎ事項へ振り分ける。

const aiExtractSchema = z.object({
  workContent: z
    .string()
    .describe("作業内容。下書きから読み取り、日報に載せられる整った日本語の文章にまとめる。"),
  materials: z
    .array(
      z.object({
        name: z.string().describe("材料名（例: ベニヤ合板）"),
        quantity: z
          .string()
          .nullable()
          .describe("数量の数値部分（例: 5）。不明なら null"),
        unit: z
          .string()
          .nullable()
          .describe("単位（例: 枚・本・m）。不明なら null"),
      }),
    )
    .describe("使用した材料の一覧。無ければ空配列。"),
  expenses: z
    .array(
      z.object({
        label: z.string().describe("経費の名目（例: 高速代・材料立替）"),
        amount: z.number().int().describe("金額（円・整数）"),
      }),
    )
    .describe(
      "駐車場代以外の経費。駐車場代は別欄で管理するため、ここには絶対に含めない。無ければ空配列。",
    ),
  parkingFee: z
    .number()
    .int()
    .nullable()
    .describe("駐車場代（円・整数）。下書きに記載があれば設定し、無ければ null。"),
  handover: z
    .string()
    .describe("引き継ぎ事項・次の担当者への申し送り。無ければ空文字。"),
});

const EXTRACT_SYSTEM_PROMPT = [
  "あなたは建設現場の日報作成を補助するアシスタントです。",
  "スタッフがスマホで箇条書きした「現場詳細」の下書きを受け取り、日報の各項目へ振り分けます。",
  "- workContent: 当日の作業内容を、日報に載せられる整った日本語の文章にまとめる。",
  "- materials: 使用した材料を name / quantity / unit に分けて配列にする。無ければ空配列。",
  "- expenses: 経費（名目 label と金額 amount 円）。ただし駐車場代は別欄で管理するので絶対に含めない。金額は円の整数。無ければ空配列。",
  "- parkingFee: 駐車場代が下書きにあれば円の整数で。無ければ null。",
  "- handover: 明日以降の予定や次の担当者への申し送りがあれば記載。無ければ空文字。",
  "下書きに書かれていない情報を創作しないこと。日本語で出力すること。",
].join("\n");

export interface AiExtractResult {
  workContent: string;
  materials: { name: string; quantity?: string; unit?: string }[];
  expenses: { label: string; amount: number }[];
  parkingFee: number | null;
  handover: string;
}

export type AiExtractResponse =
  | { status: "unconfigured" } // ANTHROPIC_API_KEY 未設定 or 入力が空
  | { status: "error"; message: string } // API 呼び出し失敗
  | { status: "ok"; result: AiExtractResult };

export async function aiExtractFields(input: {
  draft: string;
}): Promise<AiExtractResponse> {
  await requireUser();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const draft = (input.draft || "").trim();

  // キー未設定・入力なしは抽出せず「未設定」を返す（要約フォールバックは使わない）
  if (!apiKey || draft === "") {
    return { status: "unconfigured" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 2048,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            "以下の現場詳細（下書き）を日報の各項目へ振り分けてください。",
            "",
            "【現場詳細（下書き）】",
            draft,
          ].join("\n"),
        },
      ],
      output_config: {
        format: zodOutputFormat(aiExtractSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return { status: "error", message: "AIの解析結果を取得できませんでした。" };
    }

    return {
      status: "ok",
      result: {
        workContent: parsed.workContent,
        materials: parsed.materials.map((m) => ({
          name: m.name,
          quantity: m.quantity ?? undefined,
          unit: m.unit ?? undefined,
        })),
        expenses: parsed.expenses.map((e) => ({ label: e.label, amount: e.amount })),
        parkingFee: parsed.parkingFee,
        handover: parsed.handover,
      },
    };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[ai-extract] Claude API エラー:", e.status, e.message);
    } else {
      console.error("[ai-extract] 予期しないエラー:", e);
    }
    return {
      status: "error",
      message: "AIの振り分けに失敗しました。時間をおいて再度お試しください。",
    };
  }
}
