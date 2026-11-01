import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Shanghai Life — 过侬的上海日脚",
  description: "一款以上海为背景的模拟人生小游戏。在 3D 城市地图上挤地铁、吃生煎、逛武康路，和其他玩家一起过上海的日子。",
  metadataBase: new URL("https://shanghailife.app"),
  openGraph: { title: "Shanghai Life — 过侬的上海日脚", description: "模拟人生风格的上海生活游戏，浏览器免费玩。", url: "https://shanghailife.app", siteName: "Shanghai Life", locale: "zh_CN", type: "website" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: "#a9c98f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
