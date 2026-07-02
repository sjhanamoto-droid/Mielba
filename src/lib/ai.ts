// 日報 AIサポート（要件 §4.3.3）
// ── 自動要約・誤記補正・書き漏れ防止 ──
//
// 現状はローカルの決定論的エンジン（外部API・コスト・遅延なしで動作）。
// 本番では generateSummary を実LLM（Claude等）に差し替えるだけで高度化できる。
// 差し替えポイント: AI_PROVIDER 環境変数 + 実装の追加。

export interface AiAssist {
  summary: string;
  corrections: { from: string; to: string }[];
  warnings: string[];
}

// よくある変換ミス・表記ゆれの補正辞書（軽量）
const TYPO_MAP: [RegExp, string][] = [
  [/解対/g, "解体"],
  [/施工中?り/g, "施工"],
  [/養正/g, "養生"],
  [/確忍/g, "確認"],
  [/配かん/g, "配管"],
  [/塗そう/g, "塗装"],
  [/足ば/g, "足場"],
];

function normalize(text: string): { text: string; corrections: { from: string; to: string }[] } {
  let out = text;
  const corrections: { from: string; to: string }[] = [];
  for (const [re, to] of TYPO_MAP) {
    const matches = out.match(re);
    if (matches) {
      for (const m of matches) corrections.push({ from: m, to });
      out = out.replace(re, to);
    }
  }
  // 全角スペースの連続を整理
  out = out.replace(/[ 　]{2,}/g, " ");
  return { text: out, corrections };
}

// 文を句点・改行で分割
function splitSentences(text: string): string[] {
  return text
    .split(/[。\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// キーワードによる重要文抽出 → 要約
const KEYWORDS = ["完了", "確認", "腐食", "劣化", "共有", "連絡", "予定", "追加", "解体", "搬入", "据付", "塗装", "養生", "是正", "安全", "発注", "納品", "問題", "不具合", "施主"];

function summarize(text: string): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return "";
  if (sentences.length <= 2) return sentences.join("。") + "。";

  // キーワードを含む文を優先、なければ先頭・末尾
  const scored = sentences.map((s, i) => {
    let score = 0;
    for (const k of KEYWORDS) if (s.includes(k)) score += 2;
    if (i === 0) score += 1;
    if (i === sentences.length - 1) score += 1;
    return { s, score, i };
  });
  const top = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
  const picked = top.length > 0 ? top : sentences.slice(0, 2);
  return picked.join("。") + "。";
}

export interface AssistInput {
  detail: string;
  hasMaterials: boolean;
  hasPhotos: boolean;
}

export function assistReport(input: AssistInput): AiAssist {
  const { text, corrections } = normalize(input.detail || "");
  const summary = text ? "【要約】" + summarize(text) : "";

  const warnings: string[] = [];
  const len = text.replace(/\s/g, "").length;
  if (len < 15) {
    warnings.push("作業内容の記載が短いようです。誰が読んでも状況が分かるよう、もう少し具体的に書きましょう。");
  }
  if (/腐食|劣化|不具合|問題|破損|漏れ|割れ/.test(text) && !input.hasPhotos) {
    warnings.push("不具合に関する記載があります。証跡として写真の添付を推奨します。");
  }
  if (/(発注|手配|注文)/.test(text)) {
    warnings.push("発注に関する記載があります。「材料発注」に配達予定日を登録しておきましょう。");
  }
  if (/(次回|明日|来週|今後)/.test(text)) {
    warnings.push("次回工程の記載があります。「次回工程打合せ」に業者・支給品納品日を残すと段取りが共有できます。");
  }
  if (!input.hasMaterials && /(材料|資材|部材|塗料|配管|ボード|クロス)/.test(text)) {
    warnings.push("材料の記載がありますが「使用材料」が未入力です。原価・在庫の基礎データになります。");
  }

  return {
    summary,
    corrections: corrections.filter((c) => c.from !== c.to),
    warnings,
  };
}
