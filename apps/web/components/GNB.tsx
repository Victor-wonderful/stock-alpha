"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { VectaLogo } from "@/components/VectaLogo";

// IA 확정(2026-06-24, docs/PLAN.md '웹/앱 정보구조'): 8개 → 7개로 재편.
// 2026-08-20: 인사이트를 더해 8개. nav 는 이미 가로 스크롤이라 좁은 폭에서도 1줄을 지킨다.
// 추천(픽)·스크리너(시그널 탐색)·종목(검색·분석)을 본질이 달라 각각 독립 메뉴로 분리.
//   ② 추천 = /focus(엔진 엄선 픽 큐레이션, 필터 없음)
//   ③ 스크리너 = /screener(발행 중 전체 시그널 + 필터, 표/리스트)
//   ④ 종목 = /reports(검색·분석 허브 → 종목 상세 5축 스노우플레이크)
//   ⑦ 내 자산 = /watchlist(보유·진단·알림 통합 예정) · ⑧ 성과 = /picks(트랙레코드)
// 우측 아이콘: 검색→/reports(종목 검색 허브), 알림→/alerts.
// match: 통합 메뉴는 흡수한 구 라우트도 활성으로 표시(③ 종목=리포트·종목상세, ⑥ 내 자산=관심·진단).
// alpha-zone 은 추천 큐레이션에 흡수돼 더는 탐색 메뉴가 아님 → 추천 match 유지(레거시 라우트).
// 2026-08-22 (IA 1단계): 「홈」을 지우고 추천을 그 자리에 올렸다. 홈은 독립 화면이
// 아니라 다른 화면들의 요약본이었다(섹션 8개 중 7개가 중복). app/page.tsx 주석 참조.
// 메뉴 8개 (2026-08-22 Victor 확정). 이름이 곧 «그 화면이 답하는 질문»이다.
//   홈        오늘 무슨 일이 있었나 — 상태판
//   오늘의 픽  그래서 뭘 사나 — 실행 계획(진입·손절·비중)
//   스크리너   조건으로 찾는다 — 탐색 도구(매수 추천 아님)
//   분석      이 종목 어때 — 개별 종목 판단
//   시장      지금 장이 어떤가
//   인사이트   읽을 것
//   성과      우리가 잘하고 있나
//   내 자산    내 조합은 괜찮나(관심·리스크 진단·알림)
// ⚠️ 8개는 모바일 한 줄에 안 들어간다 — 모바일 이동은 하단 탭바가 맡는다
//    (components/BottomNav). 이 nav 는 md 이상에서만 보인다.
const NAV_ITEMS = [
  { href: "/", label: "홈", exact: true },
  { href: "/focus", label: "오늘의 픽", match: ["/focus", "/alpha-zone"] },
  { href: "/screener", label: "스크리너" },
  { href: "/reports", label: "분석", match: ["/reports", "/stocks"] },
  { href: "/market", label: "시장" },
  { href: "/insights", label: "인사이트" },
  { href: "/picks", label: "성과" },
  { href: "/watchlist", label: "내 자산", match: ["/watchlist", "/diagnosis", "/alerts"] },
] as const;

export function GNB() {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-md">
      {/* 반응형: 메뉴 7개의 자연 최소폭이 851px 이라 그 아래에서 라벨이 세로로 쪼개졌다
          (768px 에서 '내 자산' 4줄, 640px 에서 '스크리너' 5줄 → 56px 헤더를 뚫음).
          nav 를 가로 스크롤로 두고 항목에 nowrap 을 걸어 전 구간에서 1줄을 유지한다.
          모바일은 패딩·갭을 줄이고 로고를 심볼만 남겨 nav 가시폭을 확보한다(375px 에서 251px). */}
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:gap-6 sm:px-7">
        {/* 로고 */}
        <Link href="/" aria-label="VECTA Stock 홈" className="shrink-0">
          <VectaLogo className="flex items-center gap-2" />
        </Link>

        {/* 네비게이션 — min-w-0 이 있어야 flex 자식이 실제로 줄어들어 스크롤이 생긴다 */}
        {/* 모바일(md 미만)에서는 숨긴다 — 375px 에서 메뉴 3개만 보이고 나머지는 옆으로
            밀어야 나왔다. 이동은 하단 탭바(components/BottomNav)가 맡는다. */}
        <nav
          className="no-scrollbar hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
          aria-label="주 메뉴"
        >
          {NAV_ITEMS.map((item) => {
            const matchPaths =
              "match" in item && item.match ? item.match : [item.href];
            // exact 항목("/")은 startsWith 로 판정할 수 없다 — 모든 경로가 걸린다.
            // 그래서 href 는 정확히, match 목록은 접두어로 본다.
            const hit = (p: string) => path === p || path.startsWith(p + "/");
            const active = ("exact" in item && item.exact)
              ? path === item.href || matchPaths.some(hit)
              : matchPaths.some(hit);
            return (
              <Link
                key={item.href}
                href={item.href}
                // 활성 탭을 옐로로 채우면 화면에서 가장 강한 요소가 '지금 보고 있는 곳'이 된다.
                // 강조 예산은 사용자가 다음에 할 행동(주 액션 버튼)에 써야 한다.
                // 활성은 흰 글자 + 얇은 밑줄로 충분히 읽힌다.
                className={cn(
                  "shrink-0 whitespace-nowrap border-b-2 px-3 py-[15px] text-sm transition-colors",
                  active
                    ? "border-accent font-semibold text-text"
                    : "border-transparent text-text-dim hover:text-text",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 우측 영역 — 검색/알림/프로필 아이콘 유틸 (좌측 메뉴와 중복 라벨 제거)
            36px 이던 타깃을 44px 로 올렸다(터치 최소 규격).
            좁은 폭에서는 검색·프로필을 숨겨 nav 가시폭을 지킨다 — 검색은 좌측 '종목' 메뉴와
            같은 /reports 로 이미 도달 가능하고, 프로필은 아직 동작이 없다. */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2.5">
          <Link
            href="/reports"
            aria-label="종목 검색"
            className="hidden h-11 w-11 place-items-center rounded-full border border-border bg-surface-2 text-text-dim transition-colors hover:text-text sm:grid"
          >
            <Search className="h-4 w-4" />
          </Link>
          <Link
            href="/alerts"
            aria-label="알림"
            className="grid h-11 w-11 place-items-center rounded-full border border-border bg-surface-2 text-text-dim transition-colors hover:text-text"
          >
            <Bell className="h-4 w-4" />
          </Link>
          <button
            type="button"
            aria-label="프로필 — 로그인 준비 중"
            title="로그인 준비 중"
            className="hidden h-11 w-11 place-items-center rounded-full border border-border bg-surface-2 text-text-dim transition-colors hover:text-text sm:grid"
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
