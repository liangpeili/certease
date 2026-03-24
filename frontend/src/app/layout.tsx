import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSL Manager - 证书自动管理平台",
  description: "自动化 SSL 证书申请、续期和管理平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
