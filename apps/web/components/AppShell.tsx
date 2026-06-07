import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { MarketClock } from "./MarketClock";

export function AppShell({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 톱바 */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold">{title}</h1>
            {subtitle && (
              <span className="text-xs text-text-mute">{subtitle}</span>
            )}
            {badge}
          </div>
          <div className="flex items-center gap-4">
            <MarketClock />
            <Link
              href="/login"
              className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-text-dim hover:text-text"
            >
              로그인
            </Link>
          </div>
        </header>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
