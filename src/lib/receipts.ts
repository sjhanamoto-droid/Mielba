// 領収書読み取り（MF会計の仕訳インポート用 CSV を作る）の共通定義。
// クライアント（入力の選択肢）とサーバー（OCR・CSV 生成）の両方から使う純粋関数だけを置く。

/** 借方勘定科目の候補（MF に登録している名前と一致させる。入力欄は自由入力もできる） */
// 会社のMFの経費科目一覧（2026-11-17 受領）のうち、領収書で使うもの。
// 減価償却費・給料賃金・利子割引料は領収書から付ける科目ではないので外している。
export const RECEIPT_ACCOUNTS = [
  "消耗品費",
  "旅費交通費",
  "車両費",
  "会議費",
  "接待交際費",
  "通信費",
  "新聞図書費",
  "水道光熱費",
  "修繕費",
  "租税公課",
  "荷造運賃",
  "広告宣伝費",
  "損害保険料",
  "福利厚生費",
  "支払手数料",
  "地代家賃",
  "リース料",
  "外注工賃",
  "研修採用費",
  "雑費",
] as const;

/** 借方税区分（MF の表記そのまま） */
export const TAX_CATEGORIES = [
  "課税仕入 10%",
  "課税仕入 (軽)8%",
  "非課仕入",
  "対象外",
] as const;
export const TAX_10 = "課税仕入 10%";
export const TAX_8 = "課税仕入 (軽)8%";

/** 貸方勘定科目（支払い方法）の候補 */
export const CREDIT_ACCOUNTS: { value: string; label: string }[] = [
  { value: "現金", label: "現金" },
  { value: "未払金", label: "未払金（カード払い）" },
  { value: "普通預金", label: "普通預金（振込・口座引落）" },
  { value: "役員借入金", label: "役員借入金（社長の立替）" },
];

export type ReceiptStatus = "PROCESSING" | "FAILED" | "REVIEW" | "CONFIRMED";

/** 読み取り中のまま、この時間を過ぎたら止まったとみなす（画面を閉じた等） */
export const PROCESSING_STALE_MS = 3 * 60 * 1000;

/** 'YYYY-MM-DD' か */
export function isDateKey(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 'YYYY-MM' → '2026年11月' */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 'YYYY-MM-DD' → '11/10(月)' */
export function shortDateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const w = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${w})`;
}

export const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// ───────────────────────── CSV（MF 仕訳インポート形式） ─────────────────────────

/** MF の仕訳インポートの見出し（テンプレートと同じ27列） */
export const MF_HEADER = [
  "取引No", "取引日", "借方勘定科目", "借方補助科目", "借方部門", "借方取引先", "借方税区分",
  "借方インボイス", "借方金額(円)", "借方税額", "貸方勘定科目", "貸方補助科目", "貸方部門",
  "貸方取引先", "貸方税区分", "貸方インボイス", "貸方金額(円)", "貸方税額", "摘要", "仕訳メモ",
  "タグ", "MF仕訳タイプ", "決算整理仕訳", "作成日時", "作成者", "最終更新日時", "最終更新者",
] as const;

export type CsvReceipt = {
  receiptDate: string; // YYYY-MM-DD
  vendor: string | null;
  description: string | null;
  creditAccount: string;
  lines: { account: string; taxCategory: string; amount: number }[];
};

function cell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 摘要（「店名 内容」） */
export function receiptMemo(r: { vendor: string | null; description: string | null }): string {
  return [r.vendor?.trim(), r.description?.trim()].filter(Boolean).join(" ");
}

/**
 * MF の仕訳インポート CSV（UTF-8 のテキスト）を作る。ダウンロード時に Shift_JIS へ変換する。
 * 税率が混ざった領収書は同じ取引Noで複数行にし、貸方（支払い）の合計は1行目にだけ入れる（テンプレートと同じ）。
 */
export function buildMfCsv(receipts: CsvReceipt[], tag: string): string {
  const rows: string[] = [MF_HEADER.join(",")];
  receipts.forEach((r, i) => {
    const no = i + 1;
    const date = r.receiptDate.replace(/-/g, "/");
    const total = r.lines.reduce((s, l) => s + l.amount, 0);
    r.lines.forEach((l, j) => {
      const first = j === 0;
      const cols: (string | number)[] = [
        no, date, l.account, "", "", "", l.taxCategory, "", l.amount, 0,
        first ? r.creditAccount : "", "", "", "", first ? "対象外" : "", "",
        first ? total : 0, 0,
        first ? receiptMemo(r) : "", "", first ? tag : "", "", "", "", "", "", "",
      ];
      rows.push(cols.map(cell).join(","));
    });
  });
  return rows.join("\n") + "\n";
}

// ───────────────────────── 画面の状態表示 ─────────────────────────

export type ReceiptView = "reading" | "failed" | "review" | "ready" | "exported";

/** 一覧・詳細で出す状態（読み取り中のまま止まったものは失敗として扱う） */
export function receiptView(
  r: { status: string; exportId: string | null; updatedAt: Date },
  now = Date.now(),
): ReceiptView {
  if (r.exportId) return "exported";
  if (r.status === "CONFIRMED") return "ready";
  if (r.status === "REVIEW") return "review";
  if (r.status === "PROCESSING" && now - r.updatedAt.getTime() < PROCESSING_STALE_MS) return "reading";
  return "failed";
}

export const RECEIPT_VIEW_LABEL: Record<ReceiptView, string> = {
  reading: "読み取り中",
  failed: "読み取り失敗",
  review: "要確認",
  ready: "確認済み・未出力",
  exported: "出力済み",
};
