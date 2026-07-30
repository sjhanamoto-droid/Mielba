"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2, Info } from "lucide-react";
import { subscribePush, unsubscribePush } from "./actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// クライアントに埋め込まれる VAPID 公開鍵（購読に使用）。未設定なら非対応扱い。
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// VAPID 公開鍵（base64url）を applicationServerKey 用の Uint8Array へ変換する。
// 明示的な ArrayBuffer を裏付けにして BufferSource（ArrayBufferView<ArrayBuffer>）を満たす。
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

type Status = "loading" | "unsupported" | "on" | "off" | "denied";

/**
 * Web Push 購読トグル（設定画面に配置）。
 * クリックで許可要求 → serviceWorker.ready → pushManager.subscribe → subscribePush 保存。
 * 権限拒否・非対応（iOS Safari タブ等）はトースト/文言で案内する。
 */
export function PushSubscribe() {
  const toast = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported || !VAPID_PUBLIC_KEY) {
        if (active) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (active) setStatus(sub ? "on" : "off");
      } catch {
        if (active) setStatus("off");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    if (!VAPID_PUBLIC_KEY) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        toast("通知が許可されませんでした。端末の設定から許可してください", { type: "error" });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!p256dh || !auth) {
        toast("購読情報の取得に失敗しました", { type: "error" });
        return;
      }
      const res = await subscribePush({ endpoint: sub.endpoint, keys: { p256dh, auth } });
      if (res?.error) {
        toast(res.error, { type: "error" });
        return;
      }
      setStatus("on");
      toast("通知をオンにしました");
    } catch {
      toast("通知の設定に失敗しました。対応していない端末の可能性があります", { type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
      toast("通知をオフにしました");
    } catch {
      toast("通知の解除に失敗しました", { type: "error" });
    } finally {
      setBusy(false);
    }
  }

  // 非対応（iOS Safari タブ・鍵未設定等）
  if (status === "unsupported") {
    return (
      <div className="card flex items-start gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-ink-muted">
          <BellOff className="h-5 w-5" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-bold text-ink">プッシュ通知</p>
          <p className="mt-0.5 flex items-start gap-1 text-xs leading-relaxed text-ink-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              この端末・ブラウザは通知に対応していません。iPhone では「ホーム画面に追加」でアプリとして開くと通知を受け取れます。
            </span>
          </p>
        </div>
      </div>
    );
  }

  // 権限が拒否済み
  if (status === "denied") {
    return (
      <div className="card flex items-start gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
          <BellOff className="h-5 w-5" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-bold text-ink">プッシュ通知はブロックされています</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            端末の設定・ブラウザのサイト設定から通知を「許可」に変更してください。
          </p>
        </div>
      </div>
    );
  }

  const on = status === "on";
  const loading = status === "loading";

  return (
    <div className="card flex items-center gap-3.5 p-4">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          on ? "bg-brand-50 text-brand-600" : "bg-surface-sunken text-ink-muted",
        )}
      >
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-ink">プッシュ通知</p>
        <p className="truncate text-xs text-ink-muted">
          {on ? "この端末で通知を受け取ります" : "日報・現場のお知らせを端末に通知します"}
        </p>
      </div>
      <button
        type="button"
        onClick={on ? disable : enable}
        disabled={busy || loading}
        role="switch"
        aria-checked={on}
        aria-label={on ? "通知をオフにする" : "通知をオンにする"}
        className={cn(
          "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          on ? "bg-brand-600" : "bg-surface-sunken",
        )}
      >
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-card transition-transform",
            on ? "translate-x-7" : "translate-x-1",
          )}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" />}
        </span>
      </button>
    </div>
  );
}
