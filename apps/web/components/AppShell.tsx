import { GNB } from "./GNB";

export function AppShell({
  title,
  subtitle,
  badge,
  hideHeader,
  children,
}: {
  title: string;
  /** 문자열뿐 아니라 노드도 받는다 — 종목 코드처럼 «누를 수 있는» 조각이 섞인다. */
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  hideHeader?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <GNB />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 py-7 pb-10">
        {/* 페이지 헤더 */}
        {!hideHeader && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-text">{title}</h1>
            {subtitle && (
              <span className="text-xs text-text-mute">{subtitle}</span>
            )}
            {badge}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
