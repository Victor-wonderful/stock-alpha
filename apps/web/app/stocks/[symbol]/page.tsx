import { AppShell } from "@/components/AppShell";
import { SignalTable } from "@/components/SignalTable";
import { FactorBars } from "@/components/FactorBars";
import { AlphaZoneChart } from "@/components/AlphaZoneChart";
import { SetupChip } from "@/components/AxisChips";
import { EmptyState, Panel, SampleBadge, Stat } from "@/components/ui";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  getFactor,
  getFlows,
  getInstrumentBySymbol,
  getLatestPrice,
  getOhlcv,
  getReportForInstrument,
  getRisk,
  getSignalsForSymbol,
  getValuation,
} from "@/lib/data";
import { computeSnowflake } from "@/lib/snowflake";
import { SnowflakePanel } from "@/components/SnowflakePanel";
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
  // 나머지는 inst.id/symbol 외 상호 의존이 없으므로 병렬 — 순차 8회 await(WAN 왕복 누적
  // 45~60s)를 1회분으로 단축. 렌더 지연이 프리뷰 타임아웃을 유발하던 문제 동시 해결.
  const [val, fac, sigs, flows, risk, price, ohlcv, report] = await Promise.all([
    getValuation(inst.data.id, symbol),
    getFactor(inst.data.id, symbol),
    getSignalsForSymbol(symbol),
    getFlows(inst.data.id, symbol),
    getRisk(inst.data.id, symbol),
    getLatestPrice(inst.data.id),
    getOhlcv(inst.data.id),
    getReportForInstrument(inst.data.id),
  ]);

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
  // R:R — 대표 시그널의 (목표−진입)/(진입−손절). 셋 다 있을 때만.
  const target = lead?.tp1 ?? null;
  const rr =
    lead?.entry_price != null &&
    lead?.stop_loss != null &&
    target != null &&
    lead.entry_price > lead.stop_loss
      ? (target - lead.entry_price) / (lead.entry_price - lead.stop_loss)
      : null;

  // ③ 스노우플레이크 5축 — 이미 로드한 밸류·팩터·수급·리스크를 0~100 점수화.
  const snow = computeSnowflake({
    val: val.data,
    fac: fac.data,
    flows: flows.data,
    risk: risk.data,
  });

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

      {/* ③ 스노우플레이크 히어로 — 5축 + 적정가 + 건강점수 + AI 한 줄 + ProTips */}
      <SnowflakePanel
        result={snow}
        val={val.data}
        anchor={anchor}
        currency={inst.data.currency}
      />

      {/* AI 애널리스트 리포트 */}
      <div className="mb-4">
        {report.data ? (
          <Link href={`/reports/${report.data.id}`} className="block">
            <Panel className="transition-colors hover:border-border-strong">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-text-mute">
                      AI 애널리스트 리포트
                    </span>
                    <Badge
                      variant={
                        report.data.rating === "매수"
                          ? "bull"
                          : report.data.rating === "거래 부적합"
                            ? "bear"
                            : "neutral"
                      }
                      size="md"
                    >
                      {report.data.rating ?? "—"}
                    </Badge>
                    <span className="text-2xs text-text-mute">{report.data.as_of}</span>
                  </div>
                  {report.data.summary && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-text-dim">
                      {report.data.summary}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-accent">전체 리포트 →</span>
              </div>
            </Panel>
          </Link>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-2xs text-text-mute">
            이 종목의 AI 애널리스트 리포트는 아직 발행되지 않았습니다. (엔진 `report
            indepth` 발행 대상에 포함되면 자동 게시)
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 차트 + 밸류에이션 */}
        <div className="space-y-4 lg:col-span-2">
          <Panel
            title="알파존 차트"
            action={
              lead ? (
                <div className="flex items-center gap-2">
                  <SetupChip setup={lead.setup} />
                  {rr != null && (
                    <span className="text-2xs text-text-mute">
                      R:R <span className="tnum font-semibold text-text-dim">{rr.toFixed(1)}</span>
                    </span>
                  )}
                </div>
              ) : null
            }
          >
            <AlphaZoneChart
              anchor={anchor}
              levels={{
                entry: lead?.entry_price,
                stop: lead?.stop_loss,
                tp1: lead?.tp1,
                tp2: lead?.tp2,
              }}
              candles={candles.length > 0 ? candles : undefined}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-text-dim">
              <ZoneKey color="rgba(46,189,133,0.85)" label="목표 존 (진입→목표)" />
              <ZoneKey color="rgba(61,123,255,0.85)" label="알파 존 (진입→손절)" />
              <ZoneKey color="#f6465d" label="손절선" line />
            </div>
            <p className="mt-2 text-2xs text-text-mute">
              {candles.length > 0
                ? `* KIS 일봉 ${candles.length}개. 색 존은 대표 시그널의 목표/진입/손절 가격대.`
                : "* 실 OHLCV 연결 전 합성 캔들로 구조를 표시합니다. 색 존은 대표 시그널의 목표/진입/손절 가격대."}
            </p>
          </Panel>

          {/* 알파존 레벨 — 진입/손절/목표 + 존 위치 */}
          {lead?.entry_price != null && lead?.stop_loss != null && (
            <Panel title="알파존 레벨">
              <AlphaLevels
                price={anchor}
                entry={lead.entry_price}
                stop={lead.stop_loss}
                tp1={lead.tp1}
                tp2={lead.tp2}
                rr={rr}
                currency={inst.data.currency}
              />
            </Panel>
          )}

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

function ZoneKey({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-sm"
        style={
          line
            ? { width: 14, height: 0, borderTop: `2px dashed ${color}` }
            : { width: 14, height: 10, background: color, opacity: 0.55 }
        }
      />
      {label}
    </span>
  );
}

// 알파존 레벨: 진입/손절/목표 + 현재가의 존 위치(손절 0 ~ 진입 1) 막대.
function AlphaLevels({
  price,
  entry,
  stop,
  tp1,
  tp2,
  rr,
  currency,
}: {
  price: number;
  entry: number;
  stop: number;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  currency: string;
}) {
  const toEntry = (price - entry) / entry;
  const tpPct = tp1 != null ? (tp1 - entry) / entry : null;
  const slPct = (stop - entry) / entry;
  const fill = Math.max(0, Math.min(1, (price - stop) / (entry - stop))) * 100;
  const inZone = price >= entry * 0.97 && price <= entry * 1.03;

  return (
    <div>
      {/* 존 위치 막대 */}
      <div className="flex items-center justify-between text-2xs uppercase tracking-wide text-text-mute">
        <span>손절</span>
        <span className="text-text-dim">
          진입가 대비{" "}
          <span className={`tnum font-semibold ${toEntry >= 0 ? "text-bear" : "text-bull"}`}>
            {fmtPct(toEntry)}
          </span>
          {inZone && <span className="ml-1.5 text-accent">· 진입 적합</span>}
        </span>
        <span>진입</span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-bear/25">
        <div
          className="absolute left-0 top-0 h-2 rounded-full bg-gradient-to-r from-bear/40 to-accent"
          style={{ width: `${fill}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-accent"
          style={{ left: `${fill}%` }}
        />
      </div>

      {/* 레벨 값 */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="진입가" value={fmtPrice(entry, currency)} />
        <Stat
          label={tp2 != null ? "목표 (1차)" : "목표가"}
          value={fmtPrice(tp1, currency)}
          tone="bull"
          sub={
            tp2 != null
              ? `2차 ${fmtPrice(tp2, currency)}`
              : tpPct != null
                ? fmtPct(tpPct)
                : undefined
          }
        />
        <Stat label="손절가" value={fmtPrice(stop, currency)} tone="bear" sub={fmtPct(slPct)} />
        <Stat label="R:R" value={rr != null ? rr.toFixed(1) : "—"} tone="accent" />
      </div>
    </div>
  );
}

function NetTd({ v }: { v: number | null | undefined }) {
  const tone = v == null ? "text-text-mute" : v >= 0 ? "text-bull" : "text-bear";
  const txt = v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toLocaleString()}`;
  return <td className={`mono px-3 py-2 text-right ${tone}`}>{txt}</td>;
}
