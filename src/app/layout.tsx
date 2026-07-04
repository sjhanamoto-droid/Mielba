import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerRegister } from "@/components/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mielba（ミエルバ）| 建設業 現場管理",
  description:
    "建設業向け現場管理アプリ。顧客・現場・カレンダー・日報・TODO を現場中心に一元管理。",
  applicationName: "Mielba",
  // PWA: ホーム画面追加用の manifest とアイコン（public/ 配下）
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1947e8" },
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
  ],
};

// FOUC 回避：ペイント前に localStorage 'mielba-theme' を解決して
// html[data-theme] に 'light' / 'dark' を必ずセットする（'system'/未設定は matchMedia で解決）
const themeInitScript = `(function(){try{var t=localStorage.getItem("mielba-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme はインラインスクリプトが書き換えるため suppressHydrationWarning
    <html lang="ja" suppressHydrationWarning>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
