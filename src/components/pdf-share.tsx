"use client";

import { useState } from "react";
import { Share2, Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { photoSrc } from "@/lib/photos";

/**
 * PDFの共有・保存の共通処理。
 * Web Share API のネイティブ共有シート（ファイルに保存・プリント・AirDrop等）を開き、
 * 非対応環境（PC等）はダウンロードにフォールバックする。
 * 共有シートのキャンセル（AbortError）は正常系として扱う。
 */
export async function sharePdfFile(photoId: string, label: string): Promise<void> {
  const downloadUrl = `${photoSrc(photoId)}?dl=1&name=${encodeURIComponent(label)}`;
  try {
    const res = await fetch(photoSrc(photoId));
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], `${label}.pdf`, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: label });
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${label}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    if ((e as Error)?.name !== "AbortError") {
      window.location.href = downloadUrl;
    }
  }
}

/** PDFビューアのヘッダー用「共有・保存」ボタン */
export function PdfShareButton({ photoId, label }: { photoId: string; label: string }) {
  const [sharing, setSharing] = useState(false);
  return (
    <button
      type="button"
      disabled={sharing}
      onClick={async () => {
        if (sharing) return;
        setSharing(true);
        try {
          await sharePdfFile(photoId, label);
        } finally {
          setSharing(false);
        }
      }}
      className={buttonClass({ variant: "primary", size: "sm" })}
    >
      {sharing ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden />
      )}
      共有・保存
    </button>
  );
}
