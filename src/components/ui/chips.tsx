import Link from "next/link";
import { cn } from "@/lib/utils";

// 横スクロールするフィルタチップ群（リンク方式・サーバーサイドフィルタ）
export function ChipBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">
      {children}
    </div>
  );
}

export function ChipLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-line-strong bg-surface text-ink-soft hover:bg-surface-subtle",
      )}
    >
      {children}
    </Link>
  );
}
