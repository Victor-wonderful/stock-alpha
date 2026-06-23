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
    label: "오늘의 포커스",
    href: "/focus",
    hint: "엄선 · 레짐 억제 적용",
    match: (p) => p === "/focus",
  },
  {
    label: "수급 포착",
    href: "/screener?setup=flow_accumulation",
    hint: "외인·기관 순매수 · 하락장에도 작동",
    match: (p, s) => p === "/screener" && s === "flow_accumulation",
  },
  {
    label: "진입 임박",
    href: "/alpha-zone",
    hint: "현재가가 진입가 ±3%",
    match: (p) => p.startsWith("/alpha-zone"),
  },
  {
    label: "전체",
    href: "/screener",
    hint: "발행 중 전체 시그널 · 필터",
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
