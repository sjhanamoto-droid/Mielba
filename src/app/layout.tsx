import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerRegister } from "@/components/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "シゲ電気 | 現場管理",
  description:
    "現場管理アプリ。顧客・現場・カレンダー・日報を現場中心に一元管理。",
  applicationName: "シゲ電気",
  // PWA: ホーム画面追加用の manifest とアイコン（public/ 配下）
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "シゲ電気",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#067a54",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ダークモード（ナイトモード）は廃止。端末の設定に関係なく常にライト表示にする。
    <html lang="ja" data-theme="light">
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
