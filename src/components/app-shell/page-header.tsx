import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// レスポンシブなページ上部バー。
// スマホ：コンパクト。PC/タブレット：高さ・文字を大きく、コンテンツ幅に整列。
export function PageHeader({
  title,
  subtitle,
  backHref,
  right,
  children,
  flush,
  fluid,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  right?: React.ReactNode;
  children?: React.ReactNode; // 見出し下のツール（チップ等）
  flush?: boolean; // 下境界を消す
  fluid?: boolean; // コンテンツ幅の上限を外し全幅にする
}) {
  const maxW = fluid ? "max-w-none" : "max-w-7xl";
  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-surface/90 backdrop-blur-md safe-top",
        !flush && "border-b border-line",
      )}
    >
      <div className={cn("mx-auto flex h-14 w-full items-center gap-2 px-3 md:h-[68px] md:px-8", maxW)}>
        {backHref ? (
          <Link
            href={backHref}
            aria-label="戻る"
            className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-sunken active:bg-surface-sunken"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
        ) : (
          <div className="hidden w-1 md:block" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold leading-tight text-ink md:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs text-ink-muted md:text-sm">{subtitle}</p>
          )}
        </div>
        {right && <div className="flex shrink-0 items-center gap-1.5 md:gap-2">{right}</div>}
      </div>
      {children && (
        <div className={cn("mx-auto w-full px-4 pb-3 md:px-8", maxW)}>{children}</div>
      )}
    </header>
  );
}
