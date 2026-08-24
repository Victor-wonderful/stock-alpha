import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BackToTop } from "@/components/BackToTop";
import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "VECTA Stock — 전문가급 주식 리서치 터미널",
  description: "멀티팩터 퀀트 · 펀더멘털 밸류에이션 · AI 애널리스트 리포트",
};

/**
 * 강제 다크 모드를 끈다.
 *
 * CSS 의 `color-scheme: only light` 와 **같은 말을 헤더에서도** 한다. 일부 모바일
 * 브라우저는 스타일시트를 받기 전에 배경을 먼저 칠하는데, 그때 참고하는 것이 이 메타다.
 * 둘 중 하나만 있으면 첫 화면이 깜빡 어두웠다가 밝아진다.
 *
 * themeColor 는 주소창 색이다 — 페이지 배경과 같은 값으로 둬야 화면 위쪽이 갈리지 않는다.
 */
export const viewport: Viewport = {
  colorScheme: "only light",
  themeColor: "#F5F6FC",
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
        {/* 전역 푸터 — 법적 고지는 화면마다 붙이면 빠지는 화면이 생긴다. 실제로
            2026-08-23 확인 시 홈·시장·인사이트·성과·스크리너·내 자산 6개에 없었다.
            여기 한 곳에서 모든 화면을 덮는다. */}
        <Footer />
        {/* 모바일 주 네비게이션 — md 이상에서는 스스로 숨는다(상단 GNB 가 담당).
            본문 하단 여백은 globals.css 의 body padding 이 맡는다. */}
        <BottomNav />
        {/* 맨 위로 — 긴 목록이 많은 앱이다(분석 100행·성과 표·인사이트 다섯 섹션).
            바닥까지 내려간 뒤 머리로 돌아갈 길이 없었다(2026-08-25 Victor). */}
        <BackToTop />
      </body>
    </html>
  );
}
