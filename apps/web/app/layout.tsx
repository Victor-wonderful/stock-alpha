import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock-Alpha — 전문가급 주식 리서치 터미널",
  description: "멀티팩터 퀀트 · 펀더멘털 밸류에이션 · AI 애널리스트 리포트",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        {children}
      </body>
    </html>
  );
}
