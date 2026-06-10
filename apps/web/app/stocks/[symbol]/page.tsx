import { AppShell } from "@/components/AppShell";
import { SignalTable } from "@/components/SignalTable";
import { FactorBars } from "@/components/FactorBars";
import { PriceChart } from "@/components/PriceChart";
import { EmptyState, Panel, SampleBadge, Stat } from "@/components/ui";
import {
  getFactor,
  getFlows,
  getInstrumentBySymbol,
  getLatestPrice,
  getOhlcv,
  getRisk,
  getSignalsForSymbol,
  getValuation,
} from "@/lib/data";
import { fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import type { UTCTimestamp } from "lightweight-charts";

export const dynamic = "force-dynamic";

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const inst = await getInstrumentBySymbol(symbol);
  const val = await getValuation(inst.data.id, symbol);
  const fac = await getFactor(inst.data.id, symbol);
  const sigs = await getSignalsForSymbol(symbol);
  const flows = await getFlows(inst.data.id, symbol);
  const risk = await getRisk(inst.data.id, symbol);
  const price = await getLatestPrice(inst.data.id);
  const ohlcv = await getOhlcv(inst.data.id);

  const anySample =
    inst.isSample || val.isSample || fac.isSample || sigs.isSample || flows.isSample || risk.isSample;
  const lead = sigs.data[0];
  // 참조가: 최신 KIS 종가 우선 → 없으면 시그널 진입가 → DCF → 기본값.
  const anchor = price.data?.close ?? lead?.entry_price ?? val.data?.dcf_value ?? 70000;
  const changePct = price.data?.changePct ?? null;
  const candles = ohlcv.data.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  const upside = val.data?.upside_pct ?? null;

  return (
    <AppShell
      title={inst.data.name}
      subtitle={`${inst.data.symbol} · ${inst.data.exchange}${
        inst.data.sector ? ` · ${inst.data.sector}` : ""
      }`}
      badge={anySample ? <SampleBadge /> : undefined}
    >
      {/* 가격 헤더 */}
      <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="text-2xs uppercase tracking-wide text-text-mute">
            {price.data ? `종가 · ${price.data.date}` : "참조가"}
          </p>
          <p className="tnum text-3xl font-bold">
            {fmtPrice(anchor, inst.data.currency)}
            <span className="ml-1 text-sm font-normal text-text-mute">
              {inst.data.currency}
            </span>
            {changePct != null && (
              <span
                className={`ml-2 text-base font-semibold ${
                  changePct >= 0 ? "text-bull" : "text-bear"
                }`}
              >
                {fmtPct(changePct)}
              </span>
            )}
          </p>
        </div>
        {upside != null && (
          <div>
            <p className="text-2xs uppercase tracking-wide text-text-mute">
              DCF 상승여력
            </p>
            <p
              className={`tnum text-xl font-semibold ${
                upside >= 0 ? "text-bull" : "text-bear"
              }`}
            >
              {fmtPct(upside)}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 차트 + 밸류에이션 */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title="가격 차트 · 진입/손절/목표 오버레이">
            <PriceChart
              anchor={anchor}
              levels={{ entry: lead?.entry_price, stop: lead?.stop_loss, tp1: lead?.tp1 }}
              candles={candles.length > 0 ? candles : undefined}
            />
            <p className="mt-2 text-2xs text-text-mute">
              {candles.length > 0
                ? `* KIS 일봉 ${candles.length}개. 점선은 대표 시그널의 진입/손절/TP1.`
                : "* 실 OHLCV 연결 전 합성 캔들로 구조를 표시합니다. 점선은 대표 시그널의 진입/손절/TP1."}
            </p>
          </Panel>

          <Panel title="밸류에이션">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Stat label="PER" value={fmtNum(val.data?.per)} />
              <Stat label="PBR" value={fmtNum(val.data?.pbr)} />
              <Stat label="EV/EBITDA" value={fmtNum(val.data?.ev_ebitda)} />
              <Stat label="ROE" value={fmtPct(val.data?.roe)} />
              <Stat
                label="DCF 적정가"
                value={fmtPrice(val.data?.dcf_value, inst.data.currency)}
              />
              <Stat
                label="상승여력"
                value={fmtPct(val.data?.upside_pct)}
                tone={(val.data?.upside_pct ?? 0) >= 0 ? "bull" : "bear"}
                sub="DCF 기준"
              />
            </div>
          </Panel>
        </div>

        {/* 팩터 */}
        <Panel
          title="멀티팩터 스코어"
          action={
            fac.data?.sector_rank != null ? (
              <span className="text-2xs text-text-mute">
                섹터 #{fac.data.sector_rank}
              </span>
            ) : null
          }
        >
          {fac.data ? (
            <>
              <FactorBars f={fac.data} />
              <div className="mt-4 rounded-md border border-border bg-surface-2 py-3 text-center">
                <p className="text-2xs uppercase tracking-wide text-text-mute">
                  합성 알파
                </p>
                <p className="tnum mt-0.5 text-2xl font-bold text-accent">
                  {fmtNum(fac.data.composite_alpha, 2)}
                </p>
              </div>
            </>
          ) : (
            <EmptyState message="팩터 데이터 없음" />
          )}
        </Panel>
      </div>

      {/* 수급 · 리스크 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="수급 · 투자자별 순매수" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                  <th className="py-2 pl-1 text-left font-medium">일자</th>
                  <th className="px-3 py-2 text-right font-medium">기관</th>
                  <th className="px-3 py-2 text-right font-medium">외국인</th>
                  <th className="px-3 py-2 text-right font-medium">개인</th>
                  <th className="px-3 py-2 text-right font-medium">공매도</th>
                </tr>
              </thead>
              <tbody>
                {flows.data.map((f) => (
                  <tr key={f.date} className="border-b border-border/50 last:border-0">
                    <td className="mono py-2 pl-1 text-2xs text-text-dim">{f.date}</td>
                    <NetTd v={f.inst_net} />
                    <NetTd v={f.foreign_net} />
                    <NetTd v={f.retail_net} />
                    <td className="mono px-3 py-2 text-right text-text-mute">
                      {f.short_volume != null ? f.short_volume.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-2xs text-text-mute">단위: 순매수(+매수/−매도). 공매도는 거래량.</p>
        </Panel>

        <Panel title="리스크">
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="베타(β)" value={fmtNum(risk.data.beta, 2)} />
            <Stat label="연 변동성" value={fmtPct(risk.data.vol_annual)} />
            <Stat label="VaR 95% (1일)" value={fmtPct(risk.data.var_95)} tone="bear" />
            <Stat label="최대낙폭" value={fmtPct(risk.data.max_drawdown)} tone="bear" />
          </div>
          <p className="mb-2 mt-4 text-2xs uppercase tracking-wide text-text-mute">팩터 노출</p>
          <div className="space-y-2">
            {risk.data.factor_exposure.map((e) => (
              <div key={e.label} className="flex items-center gap-3 text-sm">
                <span className="w-12 text-xs text-text-dim">{e.label}</span>
                <div className="relative h-2 flex-1 rounded-full bg-surface-3">
                  <div className="absolute left-1/2 top-0 h-2 w-px bg-border-strong" />
                  <div
                    className={`absolute top-0 h-2 rounded-full ${e.value >= 0 ? "bg-bull" : "bg-bear"}`}
                    style={
                      e.value >= 0
                        ? { left: "50%", width: `${Math.min(Math.abs(e.value) / 2, 1) * 50}%` }
                        : { right: "50%", width: `${Math.min(Math.abs(e.value) / 2, 1) * 50}%` }
                    }
                  />
                </div>
                <span className="tnum w-10 text-right text-xs text-text-dim">{fmtNum(e.value, 1)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 시그널 */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-dim">
          시그널 · 스타일 × 셋업 × 세션
        </h2>
        {sigs.data.length === 0 ? (
          <EmptyState message="이 종목에 발행된 시그널이 없습니다." />
        ) : (
          <SignalTable rows={sigs.data} />
        )}
      </div>

      {anySample && (
        <p className="mt-4 text-2xs text-text-mute">
          * 일부 항목이 예시 데이터입니다. 파이프라인 가동 시 실데이터로 대체됩니다.
        </p>
      )}
    </AppShell>
  );
}

function NetTd({ v }: { v: number | null | undefined }) {
  const tone = v == null ? "text-text-mute" : v >= 0 ? "text-bull" : "text-bear";
  const txt = v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toLocaleString()}`;
  return <td className={`mono px-3 py-2 text-right ${tone}`}>{txt}</td>;
}
