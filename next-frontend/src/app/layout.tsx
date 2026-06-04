import type { Metadata } from "next";
import "./globals.css";
import AppInit from "@/components/AppInit";

export const metadata: Metadata = {
  title: "Moneta — 웹소설 AI 어시스턴트",
  description: "웹소설 작가를 위한 첫 번째 AI 어시스턴스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <AppInit>{children}</AppInit>
      </body>
    </html>
  );
}
