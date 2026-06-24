"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// ② 추천 — 4개 탭 통합(IA 확정 2026-06-23, docs/PLAN.md).
// 같은 signals 데이터를 필터만 달리해 노출: 포커스↔알파존 모순을 한 surface로 흡수.
//   오늘의 포커스(/focus) · 수급 포착(/screener?setup=flow_accumulation) ·
//   진입 임박(/alpha-zone) · 전체(/screener)
const TABS: Array<{
  label: string;
  href: string;
  hint: string;
  match: (path: string, setup: string | null) => boolean;
}> = [
  {
    label: "오늘의 추천",
    href: "/focus",
    hint: "AI가 엄선한 오늘의 핵심 — 보통 여기만 봐도 됩니다",
    match: (p) => p === "/focus",
  },
  {
    label: "지금 살 자리",
    href: "/alpha-zone",
    hint: "가격이 진입 구간에 도달한 종목",
    match: (p) => p.startsWith("/alpha-zone"),
  },
  {
    label: "큰손이 사요",
    href: "/screener?setup=flow_accumulation",
    hint: "외국인·기관이 담고 있는 종목",
    match: (p, s) => p === "/screener" && s === "flow_accumulation",
  },
  {
    label: "전체 신호",
    href: "/screener",
    hint: "발행 중 모든 신호 — 직접 탐색용",
    match: (p, s) => p === "/screener" && s !== "flow_accumulation",
  },
];

function Tabs() {
  const path = usePathname();
  const setup = useSearchParams().get("setup");
  const active = TABS.find((t) => t.match(path, setup));

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const on = t === active;
          return (
            <Link
              key={t.label}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px rounded-t-[10px] border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors",
                on
                  ? "border-accent text-accent"
                  : "border-transparent text-text-dim hover:text-text",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {active && (
        <p className="mt-2 text-[11px] text-text-mute">{active.hint}</p>
      )}
    </div>
  );
}

export function RecommendTabs() {
  // useSearchParams 는 Suspense 경계를 권장 — force-dynamic 페이지라 필수는 아니나 안전하게 감싼다.
  return (
    <Suspense fallback={<div className="mb-5 h-[42px] border-b border-border" />}>
      <Tabs />
    </Suspense>
  );
}
