import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/** (app) 配下のページ遷移中に表示するスケルトン */
export default function Loading() {
  return (
    <div className="app-container space-y-4 px-4 py-4 pb-nav">
      {/* ヘッダー帯 */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
      {/* カード3枚 */}
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
