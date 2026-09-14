"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * 관리 메뉴 — 관리에 있는 화면만. 주소는 관리 호스트 기준(/members)이다.
 * 미들웨어가 admin.vecta.win/members → app/admin/members 로 바꿔 그린다.
 */
const ITEMS = [
  { href: "/", label: "홈", exact: true },
  { href: "/members", label: "회원" },
  { href: "/experts", label: "전문가 신청" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto" aria-label="관리 메뉴">
      {ITEMS.map((it) => {
        const on = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              on ? "bg-surface-2 text-text" : "text-text-dim hover:text-text",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
