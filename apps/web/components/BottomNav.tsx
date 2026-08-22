"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Filter,
  Home,
  MoreHorizontal,
  Newspaper,
  Search,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 모바일 하단 탭바 — 매일 오는 도구의 주 네비게이션.
 *
 * 왜 (2026-08-22, IA 2단계) — 상단 GNB 는 375px 에서 nav 가시폭이 251px 라 메뉴
 * 3개만 보이고 나머지는 옆으로 밀어야 나왔다(GNB 주석의 실측). 메뉴가 8개가 되면서
 * 그 문제는 더 커진다. 그래서 모바일 상단은 로고·검색·알림만 남기고 이동은 아래로
 * 내린다 — 엄지가 닿는 자리다.
 *
 * 4칸 + 「더보기」로 나눈 기준은 «매일 누르는가»다.
 *   매일: 홈 · 오늘의 픽 · 분석 · 시장
 *   가끔: 스크리너(조건 탐색) · 인사이트(읽을 것) · 성과(확인) · 내 자산(점검)
 * 8칸을 다 깔면 한 칸이 47px 로 좁아져 정작 매일 쓰는 넷이 눌리기 어려워진다.
 */
const MAIN = [
  { href: "/", label: "홈", icon: Home, exact: true },
  { href: "/focus", label: "오늘의 픽", icon: Target, match: ["/focus", "/alpha-zone"] },
  { href: "/reports", label: "분석", icon: Search, match: ["/reports", "/stocks"] },
  { href: "/market", label: "시장", icon: BarChart3 },
] as const;

const MORE = [
  { href: "/screener", label: "스크리너", icon: Filter, hint: "조건으로 찾기" },
  { href: "/insights", label: "인사이트", icon: Newspaper, hint: "읽을 것" },
  { href: "/picks", label: "성과", icon: ShieldCheck, hint: "픽 전수 기록" },
  { href: "/watchlist", label: "내 자산", icon: Target, hint: "관심 · 리스크 진단 · 알림" },
] as const;

const MORE_PATHS = ["/screener", "/insights", "/picks", "/watchlist", "/diagnosis", "/alerts"];

export function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const hit = (p: string) => path === p || path.startsWith(p + "/");
  const moreActive = MORE_PATHS.some(hit);

  return (
    <>
      {/* 「더보기」 시트 — 열렸을 때만 그린다. 바깥을 누르면 닫힌다. */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-navy/40" />
          <div
            className="absolute inset-x-0 bottom-[58px] rounded-t-[16px] border-t border-border bg-bg px-4 pb-4 pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-bold text-text">더보기</span>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setOpen(false)}
                className="text-text-mute"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="divide-y divide-border-soft">
              {MORE.map((m) => {
                const Icon = m.icon;
                return (
                  <li key={m.href}>
                    <Link
                      href={m.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 py-3"
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0 text-text-dim" />
                      <span className="text-[14px] text-text">{m.label}</span>
                      <span className="ml-auto text-[11px] text-text-mute">{m.hint}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        // 데스크톱은 상단 GNB 가 담당한다 — md 이상에서는 숨긴다.
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg/95 backdrop-blur-md md:hidden"
        aria-label="주 메뉴"
      >
        {/* pb-[env(safe-area-inset-bottom)] — 홈 인디케이터가 있는 기기에서 마지막 줄이
            제스처 바에 먹히지 않게 한다. */}
        <ul className="flex pb-[env(safe-area-inset-bottom)]">
          {MAIN.map((tab) => {
            const matches = "match" in tab && tab.match ? tab.match : [tab.href];
            const active =
              "exact" in tab && tab.exact ? path === tab.href : matches.some(hit);
            const Icon = tab.icon;
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 border-t-2 px-1 pb-2 pt-[7px] text-[10px] transition-colors",
                    active
                      ? "-mt-px border-accent font-semibold text-accent"
                      : "border-transparent text-text-mute",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={cn(
                "flex w-full flex-col items-center gap-0.5 border-t-2 px-1 pb-2 pt-[7px] text-[10px] transition-colors",
                moreActive || open
                  ? "-mt-px border-accent font-semibold text-accent"
                  : "border-transparent text-text-mute",
              )}
            >
              <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="whitespace-nowrap">더보기</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
