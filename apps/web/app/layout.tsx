import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VECTA Stock — 전문가급 주식 리서치 터미널",
  description: "멀티팩터 퀀트 · 펀더멘털 밸류에이션 · AI 애널리스트 리포트",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 지갑 등 브라우저 확장이 html/body 에 속성을 주입해 하이드레이션 경고를 유발한다.
    // 최상위 태그의 속성 불일치만 무시하며, 자식 트리 검사에는 영향이 없다.
    <html lang="ko" suppressHydrationWarning>
      <body
        className="min-h-screen bg-bg font-sans text-text antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
