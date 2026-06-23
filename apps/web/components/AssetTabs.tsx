"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// ⑤ 내 자산 — 통합 탭(IA 확정 2026-06-23, docs/PLAN.md).
// 흩어진 관심·진단·알림을 한 surface로 묶어 "내 돈 괜찮나"의 답을 한곳에. 락인 메뉴.
const TABS: Array<{ label: string; href: string; hint: string }> = [
  { label: "보유·관심", href: "/watchlist", hint: "관심 종목의 판정·시그널·픽 변화" },
  { label: "리스크 진단", href: "/diagnosis", hint: "보유 조합의 집중도·총 리스크" },
  { label: "알림", href: "/alerts", hint: "공시·손절/목표 도달 푸시" },
];

export function AssetTabs() {
  const path = usePathname();
  const active = TABS.find((t) => path === t.href || path.startsWith(t.href + "/"));

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
      {active && <p className="mt-2 text-[11px] text-text-mute">{active.hint}</p>}
    </div>
  );
}
