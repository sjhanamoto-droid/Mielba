"use client";

import { useEffect } from "react";

/**
 * Service Worker 登録（root layout にマウント済み）。
 * - /sw.js を登録して PWA（ホーム画面追加・オフラインフォールバック）を有効化する
 * - 登録失敗（非対応ブラウザ・プライベートモード等）は握りつぶす
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          /* 登録失敗はアプリ動作に影響しないため無視 */
        });
    };

    // ページ読み込み完了後に登録（初回表示のリソース競合を避ける）
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
