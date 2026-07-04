// Mielba 区分値の定義（SQLite enum 非対応のためアプリ層で制約）
// ラベル・色をここに集約し、UI 全体で共有する。

export type Role = "ADMIN" | "STAFF";
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "管理者",
  STAFF: "スタッフ",
};
// セレクトの並び（スタッフを既定の先頭に）
export const ROLE_OPTIONS: Role[] = ["STAFF", "ADMIN"];

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
  | "OTHER";
export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  WORK: "作業",
  COMPANY_STOCK: "弊社分",
  SURVEY: "現調",
  DRAWING: "図面",
  SCHEDULE: "工程表",
  KEYBOX: "キーBOX",
  OTHER: "その他",
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
export type EventCategory = "WORK" | "MEETING" | "INSPECTION" | "DELIVERY" | "OTHER";
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  WORK: "作業",
  MEETING: "打合せ",
  INSPECTION: "検査",
  DELIVERY: "搬入・納品",
  OTHER: "その他",
};
export const EVENT_CATEGORY_OPTIONS: EventCategory[] = [
  "WORK",
  "MEETING",
  "INSPECTION",
  "DELIVERY",
  "OTHER",
];

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
