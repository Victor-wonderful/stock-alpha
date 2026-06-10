import { AppShell } from "@/components/AppShell";
import { ScreenerFilters } from "@/components/ScreenerFilters";
import { SignalTable } from "@/components/SignalTable";
import { KpiStrip } from "@/components/KpiStrip";
import { EmptyState, Panel, SampleBadge } from "@/components/ui";
import { getSignals } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters = {
    style: sp.style,
    setup: sp.setup,
    session: sp.session,
    market: sp.market,
  };
  const pageSize = 100;
  const page = Math.max(1, Number(sp.page) || 1);
  const { data: signals, isSample, total } = await getSignals(
    filters,
    pageSize,
    (page - 1) * pageSize,
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (filters.style) params.set("style", filters.style);
    if (filters.setup) params.set("setup", filters.setup);
    if (filters.session) params.set("session", filters.session);
    if (filters.market) params.set("market", filters.market);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <AppShell
      title="전체 시그널"
      subtitle="스타일 × 셋업 × 세션 3축 — 직접 탐색"
      badge={isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        <KpiStrip rows={signals} />

        <Panel title="필터">
          <ScreenerFilters />
        </Panel>

        <div className="flex items-baseline justify-between">
          <p className="text-xs text-text-dim">
            총 <span className="tnum font-semibold text-text">{total.toLocaleString()}</span>개 시그널
            {totalPages > 1 && (
              <span className="text-text-mute">
                {" "}· {((page - 1) * pageSize + 1).toLocaleString()}–
                {Math.min(page * pageSize, total).toLocaleString()} 표시
              </span>
            )}
          </p>
          <p className="text-2xs text-text-mute">
            강도순 · 가격 KRW · R:R·비중은 트레이드당 리스크 기준 · 백테스트 게이트 통과분
          </p>
        </div>

        {signals.length === 0 ? (
          <EmptyState message="조건에 맞는 시그널이 없습니다. 필터를 바꿔보세요." />
        ) : (
          <SignalTable rows={signals} />
        )}

        {totalPages > 1 && (
          <nav className="flex items-center justify-between pt-2">
            <a
              href={qs(page - 1)}
              aria-disabled={page <= 1}
              className={`rounded-md border border-border px-3 py-1.5 text-xs ${
                page <= 1
                  ? "pointer-events-none text-text-mute opacity-40"
                  : "text-text-dim hover:bg-surface-hover"
              }`}
            >
              ← 이전
            </a>
            <span className="text-2xs text-text-mute tnum">
              {page} / {totalPages}
            </span>
            <a
              href={qs(page + 1)}
              aria-disabled={page >= totalPages}
              className={`rounded-md border border-border px-3 py-1.5 text-xs ${
                page >= totalPages
                  ? "pointer-events-none text-text-mute opacity-40"
                  : "text-text-dim hover:bg-surface-hover"
              }`}
            >
              다음 →
            </a>
          </nav>
        )}

        {isSample && (
          <p className="text-2xs text-text-mute">
            * DB에 발행된 시그널이 없어 예시 데이터를 표시 중입니다. 인제스트·분석·시그널
            파이프라인이 가동되면 실데이터로 자동 대체됩니다.
          </p>
        )}
      </div>
    </AppShell>
  );
}
