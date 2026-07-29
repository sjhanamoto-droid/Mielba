"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Web Speech API の型は lib.dom に無い場合があるため最小限だけ扱う（any 経由）。
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
    | (new () => RecognitionLike)
    | null;
}

// 音声入力ボタン。対応端末では Web Speech API で日本語音声を認識し、
// 確定したフレーズを onAppend で親のテキストへ追記する。
// 非対応/失敗時はトーストでキーボードのマイク（ネイティブ音声入力）を案内。
export function VoiceInputButton({
  onAppend,
  className,
}: {
  onAppend: (text: string) => void;
  className?: string;
}) {
  const toast = useToast();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  function stop() {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }

  function start() {
    const SR = getSpeechRecognition();
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = "ja-JP";
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (e: unknown) => {
        const ev = e as {
          resultIndex: number;
          results: { isFinal: boolean; 0: { transcript: string } }[];
        };
        let finalText = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
        }
        const t = finalText.trim();
        if (t) onAppend(t);
      };
      rec.onerror = (e: unknown) => {
        setListening(false);
        const err = (e as { error?: string })?.error;
        if (err === "not-allowed" || err === "service-not-allowed") {
          toast("マイクの使用が許可されていません。端末の設定でマイクを許可してください。", {
            type: "error",
          });
        } else if (err && err !== "aborted" && err !== "no-speech") {
          toast("音声入力を開始できませんでした。キーボードのマイクもご利用いただけます。", {
            type: "error",
          });
        }
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      toast("音声入力を開始できませんでした。キーボードのマイクもご利用いただけます。", {
        type: "error",
      });
    }
  }

  // Web Speech API 非対応の端末ではボタンを出さない（キーボードのマイクで代替可能）。
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      aria-pressed={listening}
      aria-label={listening ? "音声入力を停止" : "音声入力を開始"}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors active:scale-95",
        listening
          ? "border-red-500 bg-red-500 text-white"
          : "border-line-strong bg-surface text-ink-soft",
        className,
      )}
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        {listening && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
        )}
        <Mic className={cn("h-4 w-4", !listening && "text-brand-600")} />
      </span>
      {listening ? "停止" : "音声入力"}
    </button>
  );
}
