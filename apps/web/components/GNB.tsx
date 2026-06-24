"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

// IA 확정(2026-06-24, docs/PLAN.md '웹/앱 정보구조'): 8개 → 7개로 재편.
// 추천(픽)·스크리너(시그널 탐색)·종목(검색·분석)을 본질이 달라 각각 독립 메뉴로 분리.
//   ② 추천 = /focus(엔진 엄선 픽 큐레이션, 필터 없음)
//   ③ 스크리너 = /screener(발행 중 전체 시그널 + 필터, 표/리스트)
//   ④ 종목 = /reports(검색·분석 허브 → 종목 상세 5축 스노우플레이크)
//   ⑥ 내 자산 = /watchlist(보유·진단·알림 통합 예정) · ⑦ 성과 = /picks(트랙레코드)
// 우측 아이콘: 검색→/reports(종목 검색 허브), 알림→/alerts.
// match: 통합 메뉴는 흡수한 구 라우트도 활성으로 표시(③ 종목=리포트·종목상세, ⑥ 내 자산=관심·진단).
// alpha-zone 은 추천 큐레이션에 흡수돼 더는 탐색 메뉴가 아님 → 추천 match 유지(레거시 라우트).
const NAV_ITEMS = [
  { href: "/", label: "홈", exact: true },
  { href: "/focus", label: "추천", match: ["/focus", "/alpha-zone"] },
  { href: "/screener", label: "스크리너" },
  { href: "/reports", label: "종목", match: ["/reports", "/stocks"] },
  { href: "/market", label: "시장" },
  { href: "/watchlist", label: "내 자산", match: ["/watchlist", "/diagnosis", "/alerts"] },
  { href: "/picks", label: "성과" },
] as const;

export function GNB() {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-7">
        {/* 로고 */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-bold tracking-tight"
          aria-label="Stock Alpha 홈"
        >
          <span
            className="grid h-8 w-8 place-items-center rounded-full bg-accent leading-none select-none"
            aria-hidden
          >
            <Activity className="h-4 w-4 text-[#0B0C10]" strokeWidth={2.6} />
          </span>
          <span className="text-sm font-bold text-text">Stock Alpha</span>
        </Link>

        {/* 네비게이션 */}
        <nav className="flex items-center gap-1" aria-label="주 메뉴">
          {NAV_ITEMS.map((item) => {
            const matchPaths =
              "match" in item && item.match ? item.match : [item.href];
            const active = ("exact" in item && item.exact)
              ? path === item.href
              : matchPaths.some((p) => path === p || path.startsWith(p + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-[999px] px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-[#0B0C10] font-semibold"
                    : "text-text-dim hover:text-text hover:bg-surface-3",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 우측 영역 — 검색/알림/프로필 아이콘 유틸 (좌측 메뉴와 중복 라벨 제거) */}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <Link
            href="/reports"
            aria-label="종목 검색"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-2 text-text-dim hover:text-text transition-colors"
          >
            <Search className="h-4 w-4" />
          </Link>
          <Link
            href="/alerts"
            aria-label="알림"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-2 text-text-dim hover:text-text transition-colors"
          >
            <Bell className="h-4 w-4" />
          </Link>
          <button
            type="button"
            aria-label="프로필 — 로그인 준비 중"
            title="로그인 준비 중"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-2 text-text-dim hover:text-text transition-colors"
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
