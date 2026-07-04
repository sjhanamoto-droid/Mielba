import {
  Home, HardHat, CalendarDays, CheckSquare, Building2, FileText, Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

const HOME: NavItem = { href: "/", label: "ホーム", icon: Home, match: (p) => p === "/" };
const REPORTS: NavItem = { href: "/reports", label: "日報", icon: FileText, match: (p) => p.startsWith("/reports") };
const SITES: NavItem = { href: "/sites", label: "現場", icon: HardHat, match: (p) => p.startsWith("/sites") };
const CALENDAR: NavItem = { href: "/calendar", label: "カレンダー", icon: CalendarDays, match: (p) => p.startsWith("/calendar") };
const TODOS: NavItem = { href: "/todos", label: "TODO", icon: CheckSquare, match: (p) => p.startsWith("/todos") };
const CUSTOMERS: NavItem = { href: "/customers", label: "顧客", icon: Building2, match: (p) => p.startsWith("/customers") };
const DISPATCH: NavItem = { href: "/dispatch", label: "配員", icon: Users, match: (p) => p.startsWith("/dispatch") };

// 役割でナビの並びを変える。ボトムナビはちょうど5件に収める前提。
// スタッフ：日報を中心に（メイン業務）。管理者：現場・配員・全体確認を中心に。
// 管理者の 顧客・TODO はホームのタイル／メニューシートと PC サイドバーから到達できる。
export function navForRole(role: string): NavItem[] {
  if (role === "ADMIN") {
    // 管理者：ホーム・現場・配員・日報・カレンダー（5個ちょうど）
    return [HOME, SITES, DISPATCH, REPORTS, CALENDAR];
  }
  // スタッフ：日報を2番目に置き、最短で日報入力へ到達できるように
  return [HOME, REPORTS, SITES, CALENDAR, TODOS];
}

// PC サイドバー用（幅があるので全項目を出す）
export function sidebarNavForRole(role: string): NavItem[] {
  if (role === "ADMIN") {
    return [HOME, SITES, DISPATCH, REPORTS, CALENDAR, CUSTOMERS, TODOS];
  }
  return [HOME, REPORTS, SITES, CALENDAR, TODOS];
}
