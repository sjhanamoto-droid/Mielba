import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { PdfViewer } from "@/components/pdf-viewer";
import { PdfShareButton, PdfPrintButton } from "@/components/pdf-share";

// アプリ全体はピンチズーム無効（userScalable: false）だが、
// PDFビューアは図面の細部を確認できるようこのページだけズームを許可する。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#067a54" },
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
  ],
};

// 現場に登録されたPDF（図面・工程表）のアプリ内ビューア。
// ブラウザ標準のPDF表示だとモバイル/PWAで保存・印刷ができないため、
// ヘッダーに共有ボタンを備えた専用画面で表示する。
export default async function PhotoViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const photo = await db.photo.findUnique({
    where: { id },
    select: {
      id: true,
      caption: true,
      kind: true,
      siteId: true,
      site: { select: { name: true } },
    },
  });
  if (!photo) notFound();

  const label =
    photo.caption || (photo.kind === "SCHEDULE" ? "工程表PDF" : "図面PDF");

  return (
    <div>
      {/* ブラウザのメニューから印刷された場合の保険。
          アプリのUI（ヘッダーのファイル名・サイドバー・ダークモードの黒背景）を消し、
          PDFのページだけを用紙いっぱいに出す。ボタン／Ctrl+P はPDF本体を直接印刷する。 */}
      <style>{`
        @page { margin: 0; }
        @media print {
          html, body { background: #fff !important; color-scheme: light; }
          aside, nav, header, [data-print-hide] { display: none !important; }
          [class*="md:pl-"] { padding-left: 0 !important; }
          .pb-nav { padding-bottom: 0 !important; }
        }
      `}</style>

      <PageHeader
        title={label}
        subtitle={photo.site?.name}
        backHref={photo.siteId ? `/sites/${photo.siteId}` : "/"}
        right={
          <>
            <PdfPrintButton photoId={photo.id} />
            <PdfShareButton photoId={photo.id} label={label} />
          </>
        }
      />
      <PageContainer size="narrow" className="print:max-w-none print:p-0">
        <PdfViewer photoId={photo.id} />
        <p
          data-print-hide
          className="mt-4 px-1 text-center text-[11px] text-ink-faint"
        >
          右上の「印刷」でPDFをそのまま印刷、「共有・保存」でファイルへの保存・共有ができます。ピンチで拡大できます。
        </p>
      </PageContainer>
    </div>
  );
}
