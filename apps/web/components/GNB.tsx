"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// IA 원칙(2026-06-10 + V3): 첫 화면이 답이고, 도구는 뒤로, 검증은 자랑으로.
// 메뉴 순서 = 사용자 질문 순서 (대시보드 → 오늘의 픽 → 추천·스크리너 → 진단 → 분석 → 맥락 → 신뢰)
const NAV_ITEMS = [
  { href: "/", label: "대시보드", exact: true },
  { href: "/focus", label: "오늘의 포커스" },
  { href: "/screener", label: "추천 종목" },
  { href: "/diagnosis", label: "종목진단" },
  { href: "/reports", label: "종목 분석" },
  { href: "/market", label: "시장분석" },
  { href: "/watchlist", label: "워치리스트" },
  { href: "/alerts", label: "알림" },
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
            className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-[15px] font-black text-on-accent leading-none select-none"
            style={{ color: "var(--text-on-accent)" }}
            aria-hidden
          >
            α
          </span>
          <span className="text-sm font-bold text-text">
            Stock <span className="text-text-mute font-medium">Alpha</span>
          </span>
        </Link>

        {/* 네비게이션 */}
        <nav className="flex items-center gap-1" aria-label="주 메뉴">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? path === item.href
              : path === item.href || path.startsWith(item.href + "/");
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

        {/* 우측 영역 — 향후 유저 요소 추가 자리 */}
        <div className="ml-auto flex items-center gap-3" />
      </div>
    </header>
  );
}
