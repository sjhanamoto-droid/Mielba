import { cn } from "@/lib/utils";

// ページ本文の標準コンテナ。
// スマホは全幅（px-4）、PC/タブレットは中央寄せ・余白拡大。PageHeader と幅(max-w-7xl)を揃える。
// size="narrow" はフォームや読み物向けの細い幅。
export function PageContainer({
  size = "default",
  className,
  children,
}: {
  size?: "default" | "narrow" | "full";
  className?: string;
  children: React.ReactNode;
}) {
  const width =
    size === "narrow" ? "max-w-3xl" : size === "full" ? "max-w-none" : "max-w-7xl";
  return (
    <div className={cn("mx-auto w-full px-4 py-4 md:px-8 md:py-7", width, className)}>
      {children}
    </div>
  );
}
