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
