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
  const filters = { style: sp.style, setup: sp.setup, session: sp.session };
  const { data: signals, isSample } = await getSignals(filters);

  return (
    <AppShell
      title="스크리너"
      subtitle="스타일 × 셋업 × 세션 3축 시그널"
      badge={isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        <KpiStrip rows={signals} />

        <Panel title="필터">
          <ScreenerFilters />
        </Panel>

        <div className="flex items-baseline justify-between">
          <p className="text-xs text-text-dim">
            <span className="tnum font-semibold text-text">{signals.length}</span>개 시그널
          </p>
          <p className="text-2xs text-text-mute">
            가격 KRW · R:R·비중은 트레이드당 리스크 기준 · 백테스트 게이트 통과분
          </p>
        </div>

        {signals.length === 0 ? (
          <EmptyState message="조건에 맞는 시그널이 없습니다. 필터를 바꿔보세요." />
        ) : (
          <SignalTable rows={signals} />
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
