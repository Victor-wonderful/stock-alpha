"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  ListFilter,
  Star,
  FileText,
  Globe,
  Briefcase,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/screener", label: "스크리너", icon: ListFilter },
  { href: "/market", label: "시장", icon: Globe },
  { href: "/portfolio", label: "모델 포트폴리오", icon: Briefcase },
  { href: "/strategies", label: "전략·백테스트", icon: FlaskConical },
  { href: "/reports", label: "리포트", icon: FileText },
  { href: "/watchlist", label: "워치리스트", icon: Star },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <Link href="/" className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-black text-white">
          α
        </span>
        <span className="font-bold tracking-tight">
          Stock<span className="text-text-mute">-Alpha</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-0.5 p-2.5">
        {ITEMS.map((it) => {
          const active = path === it.href || path.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-surface-3 font-medium text-text"
                  : "text-text-dim hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
          <LineChart className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <div className="text-2xs leading-tight text-text-mute">
            <p className="text-text-dim">Phase 1 · MVP</p>
            <p>정보 제공용 · 투자 권유 아님</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
