import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mielba（ミエルバ）| 建設業 現場管理",
  description:
    "建設業向け現場管理アプリ。顧客・現場・カレンダー・日報・TODO を現場中心に一元管理。",
  applicationName: "Mielba",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mielba",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1947e8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="font-sans">{children}</body>
    </html>
  );
}
