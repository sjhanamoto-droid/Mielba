"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, ChevronRight, Share2, Loader2 } from "lucide-react";
import { sharePdfFile } from "@/components/pdf-share";

/**
 * 現場に登録されたPDF（図面・工程表）の1行。
 * タップでアプリ内PDFビューア（/photos/[id]。共有ボタン付き）を開く。
 * 行の右の「共有」はその場でネイティブ共有シート（ファイルに保存・プリント等）を開く。
 * 共有シート非対応の環境（PC等）はダウンロードにフォールバックする。
 */
export function PdfRow({ photoId, label }: { photoId: string; label: string }) {
  const [sharing, setSharing] = useState(false);

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      await sharePdfFile(photoId, label);
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex min-h-[44px] items-stretch gap-1.5">
      <Link
        href={`/photos/${photoId}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-ink hover:border-line-strong"
      >
        <FileText className="h-5 w-5 shrink-0 text-red-500" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
      </Link>
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
