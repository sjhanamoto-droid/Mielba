"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * トースト通知（共有契約5）
 * - <ToastProvider> を root layout にマウント済み
 * - const toast = useToast(); toast("保存しました"); / toast("失敗しました", { type: "error" });
 *   （const { toast } = useToast(); の分割代入でも使える）
 * - リダイレクト後の成功表示は <SearchParamToast />（searchParam 'toast' を1回表示してURLから除去。
 *   type は 'toastType=error' で指定）
 */

type ToastType = "success" | "error";

export type ToastFn = (message: string, opts?: { type?: ToastType }) => void;

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

const ToastContext = React.createContext<ToastFn | null>(null);

const AUTO_DISMISS_MS = 3500;

export function useToast(): ToastFn & { toast: ToastFn } {
  const fn = React.useContext(ToastContext);
  if (!fn) {
    throw new Error("useToast は <ToastProvider> の内側で使用してください");
  }
  // useToast()() でも const { toast } = useToast() でも使えるようにする
  return React.useMemo(() => Object.assign(fn.bind(null) as ToastFn, { toast: fn }), [fn]);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);
  const timersRef = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = React.useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastFn>(
    (message, opts) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, message, type: opts?.type ?? "success" }]);
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  // アンマウント時にタイマーを掃除
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* bottom-nav（4.75rem）の上に重ねる。PC はナビが無いので下端寄り */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            role="status"
            onClick={() => dismiss(t.id)}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-semibold text-white shadow-float animate-slide-up",
              t.type === "error" ? "bg-red-600" : "bg-emerald-600",
            )}
          >
            {t.type === "error" ? (
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className="min-w-0 flex-1">{t.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * リダイレクト後のトースト表示。
 * redirect(`/sites?toast=${encodeURIComponent("保存しました")}`) のように使い、
 * 遷移先ページ（またはレイアウト）に <SearchParamToast /> を置く。
 * エラー表示は &toastType=error を付ける。
 */
export function SearchParamToast() {
  return (
    <React.Suspense fallback={null}>
      <SearchParamToastInner />
    </React.Suspense>
  );
}

function SearchParamToastInner() {
  const toast = React.useContext(ToastContext);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const shownRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const message = searchParams.get("toast");
    if (!message || !toast) return;
    // 同一メッセージの二重表示（StrictMode / 再レンダー）を防ぐ
    const key = `${pathname}?${message}`;
    if (shownRef.current === key) return;
    shownRef.current = key;

    const type: ToastType = searchParams.get("toastType") === "error" ? "error" : "success";
    toast(message, { type });

    // URL から toast パラメータを除去（履歴を汚さない replace）
    const params = new URLSearchParams(searchParams.toString());
    params.delete("toast");
    params.delete("toastType");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, toast]);

  return null;
}
