import { GNB } from "./GNB";

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
    <div className="flex min-h-screen flex-col">
      <GNB />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 py-7 pb-10">
        {/* 페이지 헤더 */}
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-xl font-bold text-text">{title}</h1>
          {subtitle && (
            <span className="text-xs text-text-mute">{subtitle}</span>
          )}
          {badge}
        </div>
        {children}
      </main>
    </div>
  );
}
