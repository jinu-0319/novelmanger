import type { Metadata } from "next";
import "./globals.css";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";
import DarkModeSync from "@/components/DarkModeSync";

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
      <head>
        {/* 다크모드 FOUC 방지: hydrate 전에 localStorage에서 읽어 즉시 적용 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('moneta-store')||'{}');if(s.state&&s.state.darkMode)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <SessionProviderWrapper>
          <DarkModeSync />
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
