import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "资金费率套利看板",
  description: "只读公开行情资金费率套利数据看板"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
