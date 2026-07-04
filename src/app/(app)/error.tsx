"use client";

import { Button } from "@/components/ui/button";

/** (app) 配下のエラーバウンダリ（ナビは生かしたままコンテンツ部だけ差し替え） */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-container px-4 py-10 pb-nav">
      <div className="card p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            />
          </svg>
        </div>
        <p className="text-base font-bold text-ink">通信エラーが発生しました</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          電波の良い場所で再読み込みしてください（入力中の内容は端末に保存されています）
        </p>
        <Button type="button" className="mt-5 w-full" onClick={() => reset()}>
          再試行
        </Button>
      </div>
    </div>
  );
}
