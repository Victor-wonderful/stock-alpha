import { createClient } from "@/lib/supabase/server";
import {
  computePositionSizePct,
  DEFAULT_RISK_PER_TRADE_PCT,
} from "./position";
import type {
  BacktestView,
  FactorView,
  FlowRowView,
  InstrumentView,
  Loaded,
  MacroSeriesView,
  RecommendationView,
  RegimeView,
  ReportDetail,
  ReportListItem,
  RiskView,
  SectorRotationView,
  SignalView,
  ValuationView,
} from "./types";
import {
  SAMPLE_BACKTESTS,
  SAMPLE_MACRO,
  SAMPLE_RECS,
  SAMPLE_REGIME,
  SAMPLE_SECTORS,
  SAMPLE_SIGNALS,
  sampleFactorFor,
  sampleFlowsFor,
  sampleInstrumentFor,
  sampleRiskFor,
  sampleValuationFor,
} from "./sample";

export interface SignalFilters {
  style?: string;
  setup?: string;
  session?: string;
  market?: string; // instruments.exchange — KOSPI | KOSDAQ
}

// 로그인 사용자의 트레이드당 리스크(%). 비로그인/조회 실패 시 기본값.
// (RLS: profiles 는 본인만 read → anon 은 자동으로 기본값)
async function getUserRiskPct(): Promise<number> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return DEFAULT_RISK_PER_TRADE_PCT;
    const { data } = await supabase
      .from("profiles")
      .select("risk_per_trade_pct")
      .eq("id", user.id)
      .single();
    const v = data?.risk_per_trade_pct;
    return typeof v === "number" && v > 0 ? v : DEFAULT_RISK_PER_TRADE_PCT;
  } catch {
    return DEFAULT_RISK_PER_TRADE_PCT;
  }
}

// signals + instruments 조인 행 → SignalView.
// position_size_pct 는 저장값이 아니라 사용자 리스크로 읽기 시점 계산(lib/position).
function mapSignal(row: Record<string, unknown>, riskPct: number): SignalView {
  const inst = (row.instruments ?? {}) as Record<string, unknown>;
  const entry = row.entry_price as number | null;
  const stop = row.stop_loss as number | null;
  return {
    id: row.id as number,
    symbol: (inst.symbol as string) ?? "",
    name: (inst.name as string) ?? "",
    exchange: (inst.exchange as string) ?? "",
    currency: (inst.currency as string) ?? "KRW",
    signal_type: row.signal_type as SignalView["signal_type"],
    style: row.style as SignalView["style"],
    setup: row.setup as SignalView["setup"],
    session: row.session as SignalView["session"],
    strength: Number(row.strength ?? 0),
    timeframe: (row.timeframe as string) ?? "",
    entry_price: entry,
    stop_loss: stop,
    tp1: row.tp1 as number | null,
    tp2: row.tp2 as number | null,
    tp3: row.tp3 as number | null,
    risk_reward: row.risk_reward as number | null,
    position_size_pct: computePositionSizePct(entry, stop, riskPct),
    holding_horizon: row.holding_horizon as string | null,
    llm_rationale: row.llm_rationale as string | null,
    valid_until: row.valid_until as string | null,
    created_at: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export async function getSignals(
  filters: SignalFilters = {},
  limit = 100,
  offset = 0,
): Promise<Loaded<SignalView[]> & { total: number }> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("signals")
      // !inner — 시장(market) 필터가 임베드 컬럼(instruments.exchange) 대상이라
      // 내부 조인 필요. instrument_id 는 not null FK 라 결과 집합은 동일.
      .select("*, instruments!inner(symbol,name,exchange,currency)", {
        count: "exact",
      })
      // 강도(strength) 내림차순 — 같은 배치라 created_at 정렬은 무의미. 강한 시그널 우선.
      .order("strength", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (filters.style) q = q.eq("style", filters.style);
    if (filters.setup) q = q.eq("setup", filters.setup);
    if (filters.session) q = q.eq("session", filters.session);
    if (filters.market) q = q.eq("instruments.exchange", filters.market);

    const { data, error, count } = await q;
    if (error) throw error;
    if (!data || data.length === 0) {
      const s = applyFilters(SAMPLE_SIGNALS, filters);
      return { data: s, isSample: true, total: s.length };
    }
    const riskPct = await getUserRiskPct();
    return {
      data: data.map((r) => mapSignal(r, riskPct)),
      isSample: false,
      total: count ?? data.length,
    };
  } catch {
    const s = applyFilters(SAMPLE_SIGNALS, filters);
    return { data: s, isSample: true, total: s.length };
  }
}

function applyFilters(rows: SignalView[], f: SignalFilters): SignalView[] {
  return rows.filter(
    (r) =>
      (!f.style || r.style === f.style) &&
      (!f.setup || r.setup === f.setup) &&
      (!f.session || r.session === f.session) &&
      (!f.market || r.exchange === f.market),
  );
}

export async function getInstrumentBySymbol(
  symbol: string,
): Promise<Loaded<InstrumentView>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("instruments")
      .select("id,symbol,name,exchange,sector,currency")
      .eq("symbol", symbol)
      .limit(1)
      .single();
    if (error || !data) throw error ?? new Error("not found");
    return { data: data as InstrumentView, isSample: false };
  } catch {
    return { data: sampleInstrumentFor(symbol), isSample: true };
  }
}

export async function getValuation(
  instrumentId: number,
  symbol = "",
): Promise<Loaded<ValuationView | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("valuations")
      .select("per,pbr,ev_ebitda,roe,dcf_value,upside_pct")
      .eq("instrument_id", instrumentId)
      .order("date", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw error ?? new Error("none");
    return { data: data as ValuationView, isSample: false };
  } catch {
    return { data: sampleValuationFor(symbol), isSample: true };
  }
}

export async function getFactor(
  instrumentId: number,
  symbol = "",
): Promise<Loaded<FactorView | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("factor_scores")
      .select(
        "value_z,quality_z,momentum_z,growth_z,lowvol_z,size_z,composite_alpha,sector_rank",
      )
      .eq("instrument_id", instrumentId)
      .order("date", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw error ?? new Error("none");
    return { data: data as FactorView, isSample: false };
  } catch {
    return { data: sampleFactorFor(symbol), isSample: true };
  }
}

export async function getSignalsForSymbol(
  symbol: string,
): Promise<Loaded<SignalView[]>> {
  // instrument_id 로 직접 조회 — 전역 시그널을 클라이언트 필터하면 1000행 제한·
  // 강도순 상위 절단으로 해당 종목을 놓칠 수 있음.
  try {
    const supabase = await createClient();
    const { data: inst } = await supabase
      .from("instruments")
      .select("id")
      .eq("symbol", symbol)
      .limit(1)
      .single();
    if (!inst) throw new Error("no instrument");
    const { data, error } = await supabase
      .from("signals")
      .select("*, instruments(symbol,name,exchange,currency)")
      .eq("instrument_id", inst.id)
      .order("strength", { ascending: false });
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    const riskPct = await getUserRiskPct();
    return { data: data.map((r) => mapSignal(r, riskPct)), isSample: false };
  } catch {
    // 해당 종목 시그널이 없으면 예시에서 심볼만 맞춰 보여줌
    return {
      data: SAMPLE_SIGNALS.map((s) => ({ ...s, symbol })),
      isSample: true,
    };
  }
}

// FRED series_id → 표시 메타. spark 는 최근 값 시퀀스.
const MACRO_META: Record<string, { label: string; unit: string }> = {
  DGS10: { label: "미 국채 10Y", unit: "%" },
  DEXKOUS: { label: "원/달러", unit: "원" },
  VIXCLS: { label: "VIX", unit: "" },
  DCOILWTICO: { label: "WTI 유가", unit: "$" },
};

// ── 시장(마켓) ── regime·sectors·macro 모두 엔진/외부 실데이터. 셋 다 실이면
//    isSample=false 로 "예시" 배지 제거. 하나라도 폴백이면 true.
export async function getMarket(): Promise<
  Loaded<{ regime: RegimeView; macro: MacroSeriesView[]; sectors: SectorRotationView[] }>
> {
  let regime: RegimeView = SAMPLE_REGIME;
  let sectors: SectorRotationView[] = SAMPLE_SECTORS;
  let macro: MacroSeriesView[] = SAMPLE_MACRO;
  let regimeReal = false, sectorsReal = false, macroReal = false;

  try {
    const supabase = await createClient();

    // 레짐
    const { data: rg } = await supabase
      .from("market_regime")
      .select("regime,score,drivers")
      .order("date", { ascending: false })
      .limit(1)
      .single();
    if (rg) {
      regime = {
        regime: rg.regime as RegimeView["regime"],
        score: Number(rg.score),
        drivers: (rg.drivers as string[]) ?? [],
      };
      regimeReal = true;
    }

    // 섹터 로테이션 (최신 date)
    const { data: srDate } = await supabase
      .from("sector_rotation")
      .select("date")
      .order("date", { ascending: false })
      .limit(1)
      .single();
    if (srDate?.date) {
      const { data: sr } = await supabase
        .from("sector_rotation")
        .select("sector,momentum,flow")
        .eq("date", srDate.date)
        .order("momentum", { ascending: false });
      if (sr && sr.length > 0) {
        sectors = sr.map((r: Record<string, unknown>) => ({
          sector: r.sector as string,
          momentum: Number(r.momentum ?? 0),
          flow: Number(r.flow ?? 0),
        }));
        sectorsReal = true;
      }
    }

    // 매크로 (FRED) — series 별 최신값·전일대비·스파크
    const ids = Object.keys(MACRO_META);
    const { data: mc } = await supabase
      .from("macro")
      .select("series_id,date,value")
      .in("series_id", ids)
      .order("date", { ascending: true });
    if (mc && mc.length > 0) {
      const bySeries = new Map<string, number[]>();
      for (const row of mc as { series_id: string; value: number }[]) {
        const arr = bySeries.get(row.series_id) ?? [];
        arr.push(Number(row.value));
        bySeries.set(row.series_id, arr);
      }
      const built: MacroSeriesView[] = [];
      for (const id of ids) {
        const vals = bySeries.get(id);
        if (!vals || vals.length === 0) continue;
        const value = vals[vals.length - 1];
        const prev = vals.length > 1 ? vals[vals.length - 2] : value;
        built.push({
          series_id: id,
          label: MACRO_META[id].label,
          value,
          unit: MACRO_META[id].unit,
          change: Number((value - prev).toFixed(4)),
          spark: vals.slice(-16),
        });
      }
      if (built.length > 0) {
        macro = built;
        macroReal = true;
      }
    }
  } catch {
    /* 폴백 유지 */
  }

  return {
    data: { regime, macro, sectors },
    isSample: !(regimeReal && sectorsReal && macroReal),
  };
}

// ── 모델 포트폴리오 / 추천 ──
export async function getRecommendations(): Promise<Loaded<RecommendationView[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("recommendations")
      .select("basket_type,style,weight,conviction,thesis,entry_price,target_price,stop_loss,as_of,instruments(symbol,name)")
      .order("as_of", { ascending: false })
      .limit(100);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    // 바스켓별 최신 as_of 스냅샷만 — 지난 날짜 픽이 섞여 중복 표시되지 않게.
    const latestByBasket = new Map<string, string>();
    for (const r of data as Record<string, unknown>[]) {
      const b = (r.basket_type as string) ?? "";
      if (!latestByBasket.has(b)) latestByBasket.set(b, r.as_of as string);
    }
    const current = (data as Record<string, unknown>[]).filter(
      (r) => latestByBasket.get((r.basket_type as string) ?? "") === r.as_of,
    );
    const rows: RecommendationView[] = current.map((r: Record<string, unknown>) => {
      const inst = (r.instruments ?? {}) as Record<string, unknown>;
      return {
        basket_type: (r.basket_type as string) ?? "",
        style: r.style as RecommendationView["style"],
        symbol: (inst.symbol as string) ?? "",
        name: (inst.name as string) ?? "",
        weight: Number(r.weight ?? 0),
        conviction: Number(r.conviction ?? 0),
        thesis: (r.thesis as string) ?? "",
        entry_price: r.entry_price as number | null,
        target_price: r.target_price as number | null,
        stop_loss: r.stop_loss as number | null,
        as_of: (r.as_of as string) ?? null,
      };
    });
    return { data: rows, isSample: false };
  } catch {
    return { data: SAMPLE_RECS, isSample: true };
  }
}

// ── 전략·백테스트 ──
export async function getBacktests(): Promise<Loaded<BacktestView[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("backtests")
      .select("setup,style,ic,sharpe,mdd,turnover,win_rate,avg_rr,period")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    const rows: BacktestView[] = data.map((r: Record<string, unknown>) => ({
      setup: r.setup as BacktestView["setup"],
      style: r.style as BacktestView["style"],
      ic: r.ic as number | null,
      sharpe: r.sharpe as number | null,
      mdd: r.mdd as number | null,
      turnover: r.turnover as number | null,
      win_rate: r.win_rate as number | null,
      avg_rr: r.avg_rr as number | null,
      period: r.period as string | null,
      // 엔진이 저장한 게이트 판정(0015) 우선 — 구버전 행만 휴리스틱 폴백
      passed:
        typeof r.passed === "boolean"
          ? r.passed
          : ((r.avg_rr as number) ?? 0) >= 1.3 &&
            ((r.win_rate as number) ?? 0) >= 0.4,
    }));
    return { data: rows, isSample: false };
  } catch {
    return { data: SAMPLE_BACKTESTS, isSample: true };
  }
}

// ── 수급 (종목 상세) ──
export async function getFlows(
  instrumentId: number,
  symbol = "",
): Promise<Loaded<FlowRowView[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("flows")
      .select("date,inst_net,foreign_net,retail_net,short_volume")
      .eq("instrument_id", instrumentId)
      .order("date", { ascending: false })
      .limit(10);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    return { data: data as FlowRowView[], isSample: false };
  } catch {
    return { data: sampleFlowsFor(symbol), isSample: true };
  }
}

// ── 가격 (종목 상세) ── KIS 일봉 OHLCV.
export interface OhlcvCandle {
  time: number; // unix seconds (UTC 자정)
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LatestPrice {
  close: number;
  prevClose: number | null;
  changePct: number | null;
  date: string;
}

function tsToUnix(ts: string): number {
  return Math.floor(new Date(ts.slice(0, 10) + "T00:00:00Z").getTime() / 1000);
}

export async function getOhlcv(
  instrumentId: number,
  days = 180,
): Promise<Loaded<OhlcvCandle[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ohlcv")
      .select("ts,open,high,low,close")
      .eq("instrument_id", instrumentId)
      .eq("interval", "1d")
      .order("ts", { ascending: false })
      .limit(days);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    // 차트는 오름차순 필요 → 뒤집기. 중복 날짜 제거.
    const seen = new Set<number>();
    const candles: OhlcvCandle[] = [];
    for (const r of data as Record<string, number | string>[]) {
      const time = tsToUnix(r.ts as string);
      if (seen.has(time)) continue;
      seen.add(time);
      candles.push({
        time,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
      });
    }
    candles.reverse();
    return { data: candles, isSample: false };
  } catch {
    return { data: [], isSample: true };
  }
}

export async function getLatestPrice(
  instrumentId: number,
): Promise<Loaded<LatestPrice | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ohlcv")
      .select("ts,close")
      .eq("instrument_id", instrumentId)
      .eq("interval", "1d")
      .order("ts", { ascending: false })
      .limit(2);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    const close = Number(data[0].close);
    const prevClose = data[1] != null ? Number(data[1].close) : null;
    // 비율(fraction) 로 저장 — 표시는 fmtPct 가 ×100 처리.
    const changePct =
      prevClose != null && prevClose !== 0
        ? (close - prevClose) / prevClose
        : null;
    return {
      data: { close, prevClose, changePct, date: (data[0].ts as string).slice(0, 10) },
      isSample: false,
    };
  } catch {
    return { data: null, isSample: true };
  }
}

// ── 리스크 (종목 상세) ── 엔진 risk_metrics(베타·변동성·VaR·MDD) + factor_scores
//    (팩터 노출). 둘 다 없을 때만 샘플 폴백.
export async function getRisk(
  instrumentId: number,
  symbol = "",
): Promise<Loaded<RiskView>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("risk_metrics")
      .select("beta,vol_annual,var_95,max_drawdown")
      .eq("instrument_id", instrumentId)
      .order("date", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw error ?? new Error("none");

    // 팩터 노출: 시장(beta) + factor_scores 의 size/value/momentum z-score.
    const { data: fac } = await supabase
      .from("factor_scores")
      .select("size_z,value_z,momentum_z")
      .eq("instrument_id", instrumentId)
      .order("date", { ascending: false })
      .limit(1)
      .single();
    const factor_exposure = [
      { label: "시장", value: Number(data.beta ?? 0) },
      { label: "사이즈", value: Number(fac?.size_z ?? 0) },
      { label: "밸류", value: Number(fac?.value_z ?? 0) },
      { label: "모멘텀", value: Number(fac?.momentum_z ?? 0) },
    ];
    return {
      data: {
        beta: data.beta as number | null,
        vol_annual: data.vol_annual as number | null,
        var_95: data.var_95 as number | null,
        max_drawdown: data.max_drawdown as number | null,
        factor_exposure,
      },
      isSample: false,
    };
  } catch {
    return { data: sampleRiskFor(symbol), isSample: true };
  }
}

// ── AI 애널리스트 리포트 ──
// 샘플 폴백 없음 — 발행 전에는 빈 목록(EmptyState)이 정직한 상태.

function mapReportRow(row: Record<string, unknown>): ReportListItem {
  const inst = (row.instruments ?? {}) as Record<string, unknown>;
  return {
    id: row.id as number,
    report_type: row.report_type as string,
    symbol: (inst.symbol as string) ?? null,
    name: (inst.name as string) ?? null,
    title: row.title as string,
    as_of: row.as_of as string,
    rating: row.rating as string | null,
    target_price: row.target_price as number | null,
    summary: row.summary as string | null,
    model_version: row.model_version as string | null,
  };
}

export async function getReports(
  limit = 30,
  opts: { includeUnfit?: boolean } = {},
): Promise<Loaded<ReportListItem[]>> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("reports")
      .select(
        "id,report_type,title,as_of,rating,target_price,summary,model_version,instruments(symbol,name)",
      )
      .eq("status", "published")
      .order("as_of", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    // '거래 부적합'은 목록 기본 제외 — 종목 상세에서만 경고로 노출.
    if (!opts.includeUnfit) q = q.neq("rating", "거래 부적합");
    const { data, error } = await q;
    if (error || !data) throw error ?? new Error("empty");
    return { data: data.map(mapReportRow), isSample: false };
  } catch {
    return { data: [], isSample: false };
  }
}

// 종목 상세 페이지용 — 해당 종목의 최신 발행 인뎁스 리포트(없으면 null)
export async function getReportForInstrument(
  instrumentId: number,
): Promise<Loaded<ReportListItem | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("reports")
      .select(
        "id,report_type,title,as_of,rating,target_price,summary,model_version,instruments(symbol,name)",
      )
      .eq("instrument_id", instrumentId)
      .eq("report_type", "indepth")
      .eq("status", "published")
      .order("as_of", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) throw error ?? new Error("none");
    return { data: mapReportRow(data[0]), isSample: false };
  } catch {
    return { data: null, isSample: false };
  }
}

export async function getReportById(
  id: number,
): Promise<Loaded<ReportDetail | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("reports")
      .select("*, instruments(symbol,name)")
      .eq("id", id)
      .limit(1)
      .single();
    if (error || !data) throw error ?? new Error("not found");
    const row = data as Record<string, unknown>;
    return {
      data: {
        ...mapReportRow(row),
        payload: (row.payload as ReportDetail["payload"]) ?? null,
        body_md: (row.body_md as string) ?? null,
        source_refs: (row.source_refs as unknown[]) ?? null,
        created_at: (row.created_at as string) ?? "",
      },
      isSample: false,
    };
  } catch {
    return { data: null, isSample: false };
  }
}
