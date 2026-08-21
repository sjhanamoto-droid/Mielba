import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { PdfViewer } from "@/components/pdf-viewer";
import { PdfShareButton } from "@/components/pdf-share";

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
      fileName: true,
      lineSenderName: true,
      site: { select: { name: true } },
    },
  });
  if (!photo) notFound();

  const label =
    photo.caption ||
    photo.fileName ||
    (photo.kind === "SCHEDULE" ? "工程表PDF" : "図面PDF");
  // 受信ボックス（LINE取り込み・現場未振り分け）のプレビューは /inbox に戻す
  const backHref = photo.siteId
    ? `/sites/${photo.siteId}`
    : photo.kind === "INBOX"
      ? "/inbox"
      : "/";
  const subtitle =
    photo.site?.name ??
    (photo.lineSenderName ? `LINEから: ${photo.lineSenderName}` : undefined);

  return (
    <div>
      <PageHeader
        title={label}
        subtitle={subtitle}
        backHref={backHref}
        right={<PdfShareButton photoId={photo.id} label={label} />}
      />
      <PageContainer size="narrow">
        <PdfViewer photoId={photo.id} />
        <p className="mt-4 px-1 text-center text-[11px] text-ink-faint">
          右上の「共有・保存」から、ファイルへの保存・印刷・共有ができます。ピンチで拡大できます。
        </p>
      </PageContainer>
    </div>
  );
}
