import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";

/**
 * 現場に登録されたPDF（図面・工程表）の1行。
 * タップでアプリ内PDFビューア（/photos/[id]）を開く。
 * 共有・保存・印刷はビューアのヘッダーの「共有・保存」ボタンから行う。
 */
export function PdfRow({ photoId, label }: { photoId: string; label: string }) {
  return (
    <Link
      href={`/photos/${photoId}`}
      className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-line bg-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-ink hover:border-line-strong"
    >
      <FileText className="h-5 w-5 shrink-0 text-red-500" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
    </Link>
  );
}
