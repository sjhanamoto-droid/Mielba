"use client";

import { useEffect, useState } from "react";

// 引き継ぎを「しっかり読ませる」ための待ち時間。
// 最低5秒＋10文字ごとに1秒（上限20秒）は「確認しました」を押せない。

const MIN_SECONDS = 5;
const MAX_SECONDS = 20;
const CHARS_PER_SECOND = 10;

export function requiredReadSeconds(content: string): number {
  const extra = Math.ceil(content.trim().length / CHARS_PER_SECOND);
  return Math.min(MAX_SECONDS, MIN_SECONDS + extra);
}

/**
 * 内容に応じた残り秒数を返す（0 になったら押せる）。
 * 画面を見ていない間（別アプリ・ロック中）は数えない。
 * content が変わったら数え直したい場合は、呼び出し側のコンポーネントに key を付ける。
 */
export function useReadCountdown(content: string, enabled = true): number {
  const [left, setLeft] = useState(() => requiredReadSeconds(content));
  const done = left <= 0;

  useEffect(() => {
    if (!enabled || done) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, done]);

  return left;
}
