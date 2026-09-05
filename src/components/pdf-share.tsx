"use client";

import { useEffect, useState } from "react";
import { Share2, Loader2, Printer } from "lucide-react";
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

/** iOS/macOS Safari（Chrome/Edge を除く）。iframe 内PDFの印刷が効かないため別扱いにする */
function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrom(e|ium)|Edg\/|Android|OPR\//.test(ua);
}

/**
 * PDF本体を画面外のiframeに読み込み、その中で印刷ダイアログを開く。
 * アプリのDOM（背景色・ヘッダー・ファイル名）は一切含まれないため、
 * ブラウザ標準のPDF印刷と同じ「用紙いっぱい・原寸」で出力される。
 *
 * 印刷ダイアログの表示中にiframeやblobを破棄すると出力が途切れるため、
 * 後片付けは「次に印刷するとき」に行い、常に1つだけ残す方式にする。
 */
let printFrame: HTMLIFrameElement | null = null;
let printUrl = "";

function printInHiddenFrame(url: string): Promise<void> {
  // 前回の印刷用iframe／blobをここで解放する
  printFrame?.remove();
  if (printUrl) URL.revokeObjectURL(printUrl);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "print";
  // display:none だとPDFビューアが起動しない環境があるため、実寸のまま画面外に置く
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;";
  printFrame = frame;
  printUrl = url;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    frame.onload = () => {
      // PDFビューアの初回描画を待ってから印刷ダイアログを開く（Firefoxは長めに必要）
      const delay = /Firefox\//.test(navigator.userAgent) ? 1000 : 300;
      setTimeout(() => {
        try {
          const win = frame.contentWindow;
          if (!win) throw new Error("no contentWindow");
          win.focus();
          win.print();
          finish();
        } catch (e) {
          finish(e as Error);
        }
      }, delay);
    };
    frame.onerror = () => finish(new Error("iframe load error"));

    document.body.appendChild(frame);
    frame.src = url;

    // 読み込みが始まらないまま無反応になる環境向けの保険
    setTimeout(() => finish(new Error("timeout")), 20_000);
  });
}

/**
 * PDFをそのまま印刷する（主にPC向け）。
 * 画面をそのまま印刷すると、アプリの背景（ダークモードでは黒）やヘッダーのファイル名まで
 * 一緒に出てしまうため、PDF本体だけをiframeに読み込んで印刷する。
 * iframe印刷が使えない環境（Safari等）は、PDFを新しいタブで開いて印刷してもらう。
 */
export async function printPdfFile(photoId: string): Promise<void> {
  let url = "";
  try {
    const res = await fetch(photoSrc(photoId));
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));

    if (isSafari()) {
      // Safari は iframe 内PDFの印刷が効かないため、PDFを新しいタブで開いて印刷してもらう
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    await printInHiddenFrame(url);
  } catch (e) {
    console.error("[pdf] 印刷に失敗:", e);
    // 最後の手段：PDFを新しいタブで開き、ブラウザ標準の印刷を使ってもらう
    if (url) window.open(url, "_blank", "noopener");
    else window.open(photoSrc(photoId), "_blank", "noopener");
  }
}

/** PDFビューアのヘッダー用「印刷」ボタン（マウス環境＝PCでのみ表示） */
export function PdfPrintButton({ photoId }: { photoId: string }) {
  const [printing, setPrinting] = useState(false);
  const [show, setShow] = useState(false);

  // スマホ／タブレットは共有シートから印刷できるため、マウス環境のみ出す
  useEffect(() => {
    setShow(window.matchMedia("(pointer: fine)").matches);
  }, []);

  // PCの Ctrl+P / ⌘P も、画面ではなくPDF本体の印刷に差し替える
  useEffect(() => {
    if (!show) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void printPdfFile(photoId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photoId, show]);

  if (!show) return null;

  return (
    <button
      type="button"
      disabled={printing}
      onClick={async () => {
        if (printing) return;
        setPrinting(true);
        try {
          await printPdfFile(photoId);
        } finally {
          setPrinting(false);
        }
      }}
      className={buttonClass({ variant: "outline", size: "sm" })}
    >
      {printing ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Printer className="h-4 w-4" aria-hidden />
      )}
      印刷
    </button>
  );
}
