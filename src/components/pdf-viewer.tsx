"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { photoSrc } from "@/lib/photos";

/**
 * アプリ内PDFビューア（PDF.js）。全ページをキャンバスに縦並びで描画する。
 *
 * ブラウザ標準のPDF表示に飛ばすと、モバイル/PWAでは保存・印刷などの
 * アクションが一切できない（iframe埋め込みはiOSで1ページ目しか出ない）ため、
 * PDF.jsで自前描画し、ヘッダーに共有ボタンを置けるようにする。
 * 描画に失敗した場合は従来どおりブラウザ表示へのリンクを出す。
 */
export function PdfViewer({ photoId }: { photoId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ビューアを開いたときだけ読み込む（他ページのバンドルに含めない）
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const res = await fetch(photoSrc(photoId));
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const data = await res.arrayBuffer();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        const width = container.clientWidth || 360;
        // ピンチズームしても読めるよう物理解像度は2倍上限で描画（メモリと両立）
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "block rounded-lg bg-white shadow-sm";
          container.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
        if (cancelled) return;
        setPageCount(doc.numPages);
        setStatus("ready");
      } catch (e) {
        console.error("[pdf-viewer] 描画に失敗:", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-10 text-center">
        <AlertCircle className="h-8 w-8 text-status-danger" />
        <p className="text-sm text-ink-soft">
          PDFの表示に失敗しました。下のボタンからブラウザで開けます。
        </p>
        <a
          href={photoSrc(photoId)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: "outline", size: "md" })}
        >
          <ExternalLink className="h-4 w-4" />
          ブラウザで開く
        </a>
      </div>
    );
  }

  return (
    <div>
      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-16 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="text-sm font-medium">PDFを読み込んでいます…</span>
        </div>
      )}
      <div ref={containerRef} className="space-y-3" />
      {status === "ready" && pageCount > 1 && (
        <p className="mt-3 text-center text-xs text-ink-faint">全{pageCount}ページ</p>
      )}
    </div>
  );
}
