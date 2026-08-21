"use client";

import { useState } from "react";
import { FileText, ChevronRight, Share2, Loader2 } from "lucide-react";
import { photoSrc } from "@/lib/photos";

/**
 * 現場に登録されたPDF（図面・工程表）の1行。タップで開く＋「共有」ボタン付き。
 *
 * PCはブラウザのPDFビューアに保存・印刷ツールバーがあるが、スマホ/タブレット
 * （特にホーム画面追加のPWA）はインライン表示のみで何も操作できない。
 * そのため共有ボタンで Web Share API のネイティブ共有シートを開き、
 * 「ファイルに保存」「プリント」「AirDrop」等に渡せるようにする。
 * 共有シート非対応の環境（PC等）は ?dl=1 の強制ダウンロードにフォールバックする。
 */
export function PdfRow({ photoId, label }: { photoId: string; label: string }) {
  const [sharing, setSharing] = useState(false);

  const downloadUrl = `${photoSrc(photoId)}?dl=1&name=${encodeURIComponent(label)}`;

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await fetch(photoSrc(photoId));
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `${label}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: label });
        return;
      }
      // 共有シート非対応（PC等）はダウンロードへ
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${label}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      // 共有シートのキャンセルは正常系。それ以外はダウンロードにフォールバック
      if ((e as Error)?.name !== "AbortError") {
        window.location.href = downloadUrl;
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex min-h-[44px] items-stretch gap-1.5">
      <a
        href={photoSrc(photoId)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-ink hover:border-line-strong"
      >
        <FileText className="h-5 w-5 shrink-0 text-red-500" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
      </a>
      <button
        type="button"
        onClick={share}
        disabled={sharing}
        aria-label={`${label} を共有・保存`}
        title="共有・保存（印刷は共有シートから）"
        className="flex w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-surface text-brand-600 active:scale-95 disabled:opacity-60"
      >
        {sharing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Share2 className="h-4 w-4" aria-hidden />
        )}
        <span className="text-[9px] font-bold">共有</span>
      </button>
    </div>
  );
}
