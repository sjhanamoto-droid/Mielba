import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("card", className)}>{children}</div>;
}

// タップで遷移するカード
export function CardLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "card block tap-row hover:border-line-strong hover:shadow-float transition-all",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between px-1", className)}>
      <h2 className="text-sm font-bold text-ink-soft">{children}</h2>
      {action}
    </div>
  );
}

// ラベル + 値の縦組み（詳細画面用）
export function DataRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-2.5", className)}>
      <dt className="shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">
        {value ?? "—"}
      </dd>
    </div>
  );
}

export function DataList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-line", className)}>{children}</dl>
  );
}
