import { AppShell } from "@/components/AppShell";
import { SymbolCode } from "@/components/SymbolCode";
import { WatchButton } from "@/components/WatchButton";
import { SignalTable } from "@/components/SignalTable";
import { FactorBars } from "@/components/FactorBars";
import { AlphaZoneChart } from "@/components/AlphaZoneChart";
import { SetupChip } from "@/components/AxisChips";
import { EmptyState, Panel, SampleBadge, Stat } from "@/components/ui";
import Link from "next/link";
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
import { getSessionUser } from "@/lib/session";
import { isWatched } from "@/lib/watchlist";
import { SnowflakePanel } from "@/components/SnowflakePanel";
import { fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import type { UTCTimestamp } from "lightweight-charts";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

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

  // 리스크 지표 신선도 — risk_metrics 는 daily 배치에 편입돼 있지 않아 갱신이 멈출 수
  // 있다(2026-06-09 이후 7주간 정지). 기준일 없이 최신값 자리에 앉으면 묵은 수치를
  // 현재 리스크로 읽게 되므로, 기준일을 항상 적고 오래된 값은 경고한다.
  const RISK_STALE_DAYS = 7;
  const riskAsOf = risk.data.as_of;
  const riskAgeDays = riskAsOf
    ? Math.floor((Date.now() - new Date(`${riskAsOf}T00:00:00Z`).getTime()) / 86_400_000)
    : null;
  const riskStale = riskAgeDays != null && riskAgeDays > RISK_STALE_DAYS;

  // 관심 종목 — 이 화면이 «담는» 자리다. 목록(/watchlist)은 담긴 것을 보는 자리이고,
  // 담는 행동은 종목을 보고 있을 때 일어난다(2026-08-25).
  const [user, watched] = await Promise.all([getSessionUser(), isWatched(symbol)]);

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
      subtitle={
        <>
          {/* 종목 상세는 코드를 옮겨 적을 일이 가장 많은 화면이다 — 누르면 복사된다. */}
          <SymbolCode symbol={inst.data.symbol} className="text-text-dim" /> ·{" "}
          {inst.data.exchange}
          {inst.data.sector ? ` · ${inst.data.sector}` : ""}
        </>
      }
      badge={anySample ? <SampleBadge /> : undefined}
      headerExtra={
        <WatchButton symbol={inst.data.symbol} watched={watched} signedIn={!!user} />
      }
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
          // 네이비다(2026-08-23 Victor). 흰 패널로 두면 옆의 밸류에이션·수급 표와
          // 같은 무게로 읽혀 «엔진이 낸 판정»이라는 것이 드러나지 않았다. 이 제품의
          // 색 규칙 «네이비 = 기계가 낸 데이터»에 정확히 해당한다(메뉴 머리 밴드와 같은 축).
          // 네이비 위에서는 라이트 바탕용 색이 묻히므로 안쪽 글자를 전부 on-navy 계열로.
          <Link
            href={`/reports/${report.data.id}`}
            className="block rounded-2xl bg-navy px-4 py-3.5 transition-colors hover:bg-navy-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-on-navy-3">
                    AI 애널리스트 리포트
                  </span>
                  {/* 판정 배지 — 네이비 위에서는 밝은 바탕 + 어두운 글자로 뒤집는다.
                      라이트용 bull/bear 는 대비가 2점대로 떨어진다. */}
                  <span
                    className={`rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${
                      report.data.rating === "매수"
                        ? "bg-up-on-navy text-navy"
                        : report.data.rating === "거래 부적합"
                          ? "bg-down-on-navy text-navy"
                          : "bg-on-navy/15 text-on-navy"
                    }`}
                  >
                    {report.data.rating ?? "—"}
                  </span>
                  <span className="text-2xs text-on-navy-3">{report.data.as_of}</span>
                </div>
                {report.data.summary && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-on-navy-2">
                    {report.data.summary}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs font-semibold text-accent-on-navy">
                전체 리포트 →
              </span>
            </div>
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
                  {/* R:R 을 뺐다(2026-08-23) — «목표에서 판다»를 전제한 값이라
                      채택 규칙(trail)에서는 실현되지 않는다. 홈·오늘의 픽·스크리너와
                      같은 말로. 실제로 거는 돈은 아래 「알파존 레벨」이 말한다. */}
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
            {/* 범례·설명은 시그널이 있을 때만. 시그널이 없으면 그릴 존이 없는데
                「목표 존 · 알파 존 · 손절선」을 적어두면 색만 안 보이는 고장난 차트로
                읽힌다(2026-08-23). 이름도 새 규칙에 맞춘다 — 그 목표에서 팔지 않는다. */}
            {lead ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-text-dim">
                  <ZoneKey color="rgba(46,189,133,0.85)" label="진입 → 목표가" />
                  <ZoneKey color="rgba(61,123,255,0.85)" label="진입 → 손절가" />
                  <ZoneKey color="#1F5FD0" label="손절선" line />
                </div>
                <p className="mt-2 text-2xs text-text-mute">
                  {candles.length > 0
                    ? `* KIS 일봉 ${candles.length}개. 색 존은 대표 시그널의 진입·손절·목표 가격대.`
                    : "* 실 OHLCV 연결 전 합성 캔들로 구조를 표시합니다."}
                </p>
              </>
            ) : (
              <p className="mt-3 text-2xs text-text-mute">
                이 종목은 지금 발동한 셋업이 없어 진입·손절 가격대가 없습니다 — 캔들만
                표시합니다.
              </p>
            )}
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
          {/* ── 폰 (768 미만) — 하루가 두 줄짜리 항목으로 ──
              열 5개(일자·기관·외국인·개인·공매도)를 390px 에 넣으면 공매도가 잘린다.
              날짜를 머리에 두고 셋을 아래 한 줄로 편다 — 표보다 세로로 길어지지만
              «누가 샀나»가 한눈에 들어온다. */}
          <div className="md:hidden">
            {flows.data.map((f) => (
              <div key={`m-${f.date}`} className="border-b border-border/50 py-2.5 last:border-0">
                <p className="mono text-[12px] text-text-dim">{f.date}</p>
                <p className="mono mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
                  {[
                    { k: "기관", v: f.inst_net },
                    { k: "외국인", v: f.foreign_net },
                    { k: "개인", v: f.retail_net },
                  ].map((x) => (
                    <span key={x.k}>
                      <span className="text-text-mute">{x.k} </span>
                      <span
                        className={
                          x.v == null
                            ? "text-text-mute"
                            : x.v >= 0
                              ? "font-semibold text-bull"
                              : "font-semibold text-bear"
                        }
                      >
                        {x.v == null
                          ? "—"
                          : `${x.v >= 0 ? "+" : ""}${x.v.toLocaleString()}`}
                      </span>
                    </span>
                  ))}
                  <span className="text-text-mute">
                    공매도 {f.short_volume != null ? f.short_volume.toLocaleString() : "—"}
                  </span>
                </p>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
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
          {riskAsOf && (
            <p className={`mt-2 text-2xs ${riskStale ? "text-bear" : "text-text-mute"}`}>
              {riskStale
                ? `${riskAsOf} 기준 · ${riskAgeDays}일 지난 값 — 현재 리스크와 다를 수 있다.`
                : `${riskAsOf} 기준`}
            </p>
          )}
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
  currency,
}: {
  price: number;
  entry: number;
  stop: number;
  tp1: number | null;
  tp2: number | null;
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

      {/* 레벨 값 — 홈·오늘의 픽·스크리너와 같은 이름·같은 순서(2026-08-23).
          「목표가」·「2차 목표」·「R:R」을 버렸다: 채택 규칙(trail)은 목표에서 팔지
          않고 손절만 진입가로 올린다. 그 자리에 실제로 확정된 값 「1주당 리스크」를 둔다. */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="진입가" value={fmtPrice(entry, currency)} />
        <Stat label="손절가" value={fmtPrice(stop, currency)} tone="bear" sub={fmtPct(slPct)} />
        <Stat
          label="목표가"
          value={fmtPrice(tp1, currency)}
          tone="bull"
          sub={tpPct != null ? `${fmtPct(tpPct)} · 손절이 본전으로` : "손절이 본전으로"}
        />
        <Stat
          label="1주당 리스크"
          value={
            entry != null && stop != null
              ? `${Math.round(entry - stop).toLocaleString("ko-KR")}원`
              : "—"
          }
          sub="진입 − 손절"
        />
      </div>
    </div>
  );
}

function NetTd({ v }: { v: number | null | undefined }) {
  const tone = v == null ? "text-text-mute" : v >= 0 ? "text-bull" : "text-bear";
  const txt = v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toLocaleString()}`;
  return <td className={`mono px-3 py-2 text-right ${tone}`}>{txt}</td>;
}
