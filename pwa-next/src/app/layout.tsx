import type { Metadata, Viewport } from "next";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel in Time",
  description: "一款沉靜式 ePub 閱讀器，支援離線使用",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Travel in Time",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c1917",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    // darkMode 在 App.tsx / Notes.tsx / private/page.tsx 都是 useState(true)
    // 起始、且未做任何持久化讀取，SSR 當下就一定是深色，這裡直接同步套上
    // dark class，避免 hydration 前 <html> 沒有 dark class、body 短暫
    // 用到淺色 --color-paper 造成的白色閃爍。各元件的 runtime effect
    // 仍保留，用來處理使用者實際切換深色模式時的同步。
    <html lang="zh-Hant" className="h-dvh dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Huninn&family=Noto+Serif+TC&family=Noto+Sans+TC&family=LXGW+WenKai+TC&family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,300..700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-dvh antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
};

export default RootLayout;
