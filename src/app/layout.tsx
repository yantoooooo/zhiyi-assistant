import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智蚁 | AI 企业服务助手",
  description: "VAT、商标、专利与版权服务一站式咨询。商品价格为演示数据。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
