"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, Search, Sparkles, User } from "lucide-react";
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

        {/* 우측 영역 — 오늘의 픽 CTA + 검색/알림/프로필 */}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <Link
            href="/focus"
            className="flex items-center gap-1.5 rounded-[999px] bg-accent px-4 py-2 text-xs font-bold text-[#0B0C10] hover:bg-accent-2 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            오늘의 픽
          </Link>
          <Link
            href="/screener"
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
