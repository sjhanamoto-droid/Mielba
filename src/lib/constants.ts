// Mielba 区分値の定義（SQLite enum 非対応のためアプリ層で制約）
// ラベル・色をここに集約し、UI 全体で共有する。

// SUPER_ADMIN(最高管理者) が最上位。管理者権限を内包し、原価・金額など会計情報の
// 閲覧/入力と、材料のOCR登録を行える唯一の権限。
export type Role = "SUPER_ADMIN" | "ADMIN" | "STAFF";
export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "最高管理者",
  ADMIN: "管理者",
  STAFF: "スタッフ",
};
// セレクトの並び（スタッフを既定の先頭に）。最高管理者は最高管理者のみが付与できるため、
// UI 側で表示可否を出し分ける（ROLE_OPTIONS_SUPER_ADMIN を使う）。
export const ROLE_OPTIONS: Role[] = ["STAFF", "ADMIN"];
export const ROLE_OPTIONS_SUPER_ADMIN: Role[] = ["STAFF", "ADMIN", "SUPER_ADMIN"];

// アバター色のプリセット（ユーザー登録時に選択）
export const AVATAR_COLORS: { value: string; label: string }[] = [
  { value: "#2f63f5", label: "ブルー" },
  { value: "#1947e8", label: "ネイビー" },
  { value: "#0ea5e9", label: "スカイ" },
  { value: "#10b981", label: "グリーン" },
  { value: "#f98307", label: "オレンジ" },
  { value: "#f59e0b", label: "アンバー" },
  { value: "#8b5cf6", label: "パープル" },
  { value: "#ec4899", label: "ピンク" },
  { value: "#ef4444", label: "レッド" },
  { value: "#64748b", label: "グレー" },
];
export const DEFAULT_AVATAR_COLOR = "#2f63f5";

// ── 顧客（元請企業） ──
export type RegistrationType = "PRIME" | "SUBCONTRACTOR" | "OWNER";
export const REGISTRATION_TYPE_LABEL: Record<RegistrationType, string> = {
  PRIME: "元請",
  SUBCONTRACTOR: "一次下請",
  OWNER: "施主",
};

export type TradeStatus = "NEW" | "CONTINUING" | "SUSPENDED";
export const TRADE_STATUS_LABEL: Record<TradeStatus, string> = {
  NEW: "新規",
  CONTINUING: "継続",
  SUSPENDED: "取引停止",
};
export const TRADE_STATUS_COLOR: Record<TradeStatus, string> = {
  NEW: "info",
  CONTINUING: "active",
  SUSPENDED: "past",
};

export type PaymentMethod = "BANK" | "NOTE" | "DENSAI";
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  BANK: "振込",
  NOTE: "手形",
  DENSAI: "でんさい",
};

export type ContactType = "SITE" | "ACCOUNTING" | "APPROVER";
export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  SITE: "現場",
  ACCOUNTING: "経理",
  APPROVER: "決裁",
};

// ── 現場（案件） ──
export type ProjectType = "REFORM" | "RENOVATION" | "NEWBUILD" | "MAINTENANCE";
export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  REFORM: "リフォーム",
  RENOVATION: "改修工事",
  NEWBUILD: "新築",
  MAINTENANCE: "メンテナンス",
};

export type ProjectStatus =
  | "ESTIMATING"
  | "ORDERED"
  | "STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED";
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ESTIMATING: "見積中",
  ORDERED: "受注",
  STARTED: "着工",
  IN_PROGRESS: "施工中",
  COMPLETED: "完工",
  CLOSED: "完了",
};
export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "ESTIMATING",
  "ORDERED",
  "STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
];

export type SiteStatus = "SURVEY" | "ACTIVE" | "PAST";
export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  SURVEY: "現調",
  ACTIVE: "進行中",
  PAST: "過去",
};
export const SITE_STATUS_COLOR: Record<SiteStatus, string> = {
  SURVEY: "survey",
  ACTIVE: "active",
  PAST: "past",
};

// 進捗ステータスの7工程（現調→配線→調査→ボード開口→器具付→段取り→完了）。カード/詳細で現在地のみ点灯表示する。
// ※内部保存は projectStatus(6値) を各工程のマーカーに流用し、完了のみ siteStatus=PAST（過去）にする。
export const SITE_STAGES = ["現調", "配線", "調査", "ボード開口", "器具付", "段取り", "完了"] as const;

// siteStatus(ACTIVE|PAST) と projectStatus から現在地(0-6)を導く純関数。
// サーバー/クライアント双方から呼ぶため constants に置く。
export function siteStageIndex(siteStatus: string, projectStatus: string): number {
  if (siteStatus === "PAST") return 6; // 完了（過去）
  switch (projectStatus) {
    case "ESTIMATING":
      return 0; // 現調
    case "ORDERED":
      return 1; // 配線
    case "STARTED":
      return 2; // 調査
    case "IN_PROGRESS":
      return 3; // ボード開口
    case "COMPLETED":
      return 4; // 器具付
    case "CLOSED":
      return 5; // 段取り
    default:
      return 0; // 区分不明は現調（先頭）
  }
}

export type BillingStatus = "UNBILLED" | "BILLED" | "PARTIAL" | "PAID";
export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  UNBILLED: "未請求",
  BILLED: "請求済",
  PARTIAL: "一部入金",
  PAID: "入金完了",
};

// ── 日報 ──
export type ReportStatus = "DRAFT" | "SUBMITTED";
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  DRAFT: "未提出",
  SUBMITTED: "提出済",
};

// ── 写真 ──
export type PhotoKind =
  | "WORK"
  | "COMPANY_STOCK"
  | "SURVEY"
  | "DRAWING"
  | "SCHEDULE"
  | "KEYBOX"
  | "DELIVERY"
  | "ORDER"
  | "OTHER";
export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  WORK: "作業",
  COMPANY_STOCK: "弊社分",
  SURVEY: "現調",
  DRAWING: "図面",
  SCHEDULE: "工程表",
  KEYBOX: "キーBOX",
  DELIVERY: "納品書",
  ORDER: "発注書",
  OTHER: "その他",
};

// ── 材料の伝票種別（OCR登録） ──
export type MaterialDocumentType = "DELIVERY" | "ORDER";
export const MATERIAL_DOCUMENT_TYPE_LABEL: Record<MaterialDocumentType, string> = {
  DELIVERY: "納品書",
  ORDER: "発注書",
};

// ── カレンダー予定の出所 ──
export type EventSource = "MANUAL" | "DELIVERY" | "SUPPLY" | "PROCESS" | "MILESTONE";
export const EVENT_SOURCE_LABEL: Record<EventSource, string> = {
  MANUAL: "手動",
  DELIVERY: "配達予定",
  SUPPLY: "支給品納品",
  PROCESS: "次回工程",
  MILESTONE: "工程",
};
export const EVENT_SOURCE_COLOR: Record<EventSource, string> = {
  MANUAL: "#2f63f5",
  DELIVERY: "#f98307",
  SUPPLY: "#8b5cf6",
  PROCESS: "#10b981",
  MILESTONE: "#3b82f6",
};

// 予定のカテゴリー（内容の種別）
export type EventCategory = "WORK" | "MEETING" | "INSPECTION" | "DELIVERY" | "HOLIDAY" | "OTHER" | "OFFICE";
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  WORK: "作業",
  MEETING: "打合せ",
  INSPECTION: "検査",
  DELIVERY: "搬入・納品",
  HOLIDAY: "休み",
  OTHER: "その他",
  OFFICE: "事務所作業",
};
export const EVENT_CATEGORY_OPTIONS: EventCategory[] = [
  "WORK",
  "MEETING",
  "INSPECTION",
  "DELIVERY",
  "HOLIDAY",
  "OTHER",
];
// カテゴリー別の識別色（未指定は出所色を使う）。休みは無彩色のスレートで控えめに区別する。
export const EVENT_CATEGORY_COLOR: Partial<Record<EventCategory, string>> = {
  HOLIDAY: "#64748b",
  OFFICE: "#6366f1",
};

// 「休み」「その他」「事務所作業」は現場作業ではないため、現場を選んでも現場入り(=日報義務)を作らない。
// ※事務所作業は個人予定用。日報は不要だが稼働時間には計上する（稼働集計側で別途加算）。
export const NON_WORK_EVENT_CATEGORIES: EventCategory[] = ["HOLIDAY", "OTHER", "OFFICE"];
export function isNonWorkEventCategory(category: string | null | undefined): boolean {
  return !!category && NON_WORK_EVENT_CATEGORIES.includes(category as EventCategory);
}

// ── TODO ──
export type TodoStatus = "OPEN" | "IN_PROGRESS" | "DONE";
export const TODO_STATUS_LABEL: Record<TodoStatus, string> = {
  OPEN: "未対応",
  IN_PROGRESS: "対応中",
  DONE: "完了",
};
export const TODO_STATUS_COLOR: Record<TodoStatus, string> = {
  OPEN: "warn",
  IN_PROGRESS: "info",
  DONE: "active",
};

export type TodoScope = "SITE" | "PERSONAL";
export const TODO_SCOPE_LABEL: Record<TodoScope, string> = {
  SITE: "現場",
  PERSONAL: "個人",
};

// ── ステータス色 → Tailwind カラートークン ──
export const STATUS_TOKEN: Record<string, string> = {
  survey: "#8b5cf6",
  active: "#10b981",
  past: "#94a3b8",
  warn: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
};

// 安全に label を引く（未知値はそのまま返す）
export function labelOf<T extends string>(
  map: Record<string, string>,
  key: T | null | undefined,
): string {
  if (!key) return "—";
  return map[key] ?? key;
}

// ── 使い方のヒント（ホームの右レール＝PC のみ／メニューの「使い方・ヒント」で共有） ──
export const USAGE_TIPS = [
  "日報は「現場入り（出面）」から書き始められます",
  "カレンダーの予定は現場に紐づけて共有できます",
  "写真は作業・図面・工程などの種別で整理できます",
];
