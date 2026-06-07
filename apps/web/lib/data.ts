import { createClient } from "@/lib/supabase/server";
import type {
  BacktestView,
  FactorView,
  FlowRowView,
  InstrumentView,
  Loaded,
  MacroSeriesView,
  RecommendationView,
  RegimeView,
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
}

// signals + instruments 조인 행 → SignalView
function mapSignal(row: Record<string, unknown>): SignalView {
  const inst = (row.instruments ?? {}) as Record<string, unknown>;
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
    entry_price: row.entry_price as number | null,
    stop_loss: row.stop_loss as number | null,
    tp1: row.tp1 as number | null,
    tp2: row.tp2 as number | null,
    tp3: row.tp3 as number | null,
    risk_reward: row.risk_reward as number | null,
    position_size_pct: row.position_size_pct as number | null,
    holding_horizon: row.holding_horizon as string | null,
    llm_rationale: row.llm_rationale as string | null,
    valid_until: row.valid_until as string | null,
    created_at: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export async function getSignals(
  filters: SignalFilters = {},
  limit = 50,
): Promise<Loaded<SignalView[]>> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("signals")
      .select(
        "*, instruments(symbol,name,exchange,currency)",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (filters.style) q = q.eq("style", filters.style);
    if (filters.setup) q = q.eq("setup", filters.setup);
    if (filters.session) q = q.eq("session", filters.session);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) {
      return { data: applyFilters(SAMPLE_SIGNALS, filters), isSample: true };
    }
    return { data: data.map(mapSignal), isSample: false };
  } catch {
    return { data: applyFilters(SAMPLE_SIGNALS, filters), isSample: true };
  }
}

function applyFilters(rows: SignalView[], f: SignalFilters): SignalView[] {
  return rows.filter(
    (r) =>
      (!f.style || r.style === f.style) &&
      (!f.setup || r.setup === f.setup) &&
      (!f.session || r.session === f.session),
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
  const all = await getSignals({}, 200);
  const filtered = all.data.filter((s) => s.symbol === symbol);
  if (filtered.length > 0) return { data: filtered, isSample: all.isSample };
  // 해당 종목 시그널이 없으면 예시에서 심볼만 맞춰 보여줌
  return {
    data: SAMPLE_SIGNALS.map((s) => ({ ...s, symbol })),
    isSample: true,
  };
}

// ── 시장(마켓) ── 레짐/섹터는 파생(전용 테이블 없음) → 현재 샘플. macro 는 테이블 시도.
export async function getMarket(): Promise<
  Loaded<{ regime: RegimeView; macro: MacroSeriesView[]; sectors: SectorRotationView[] }>
> {
  // regime/sectors 는 엔진 파생 산출물 — 전용 테이블 도입 전까지 샘플 제공.
  return {
    data: { regime: SAMPLE_REGIME, macro: SAMPLE_MACRO, sectors: SAMPLE_SECTORS },
    isSample: true,
  };
}

// ── 모델 포트폴리오 / 추천 ──
export async function getRecommendations(): Promise<Loaded<RecommendationView[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("recommendations")
      .select("basket_type,style,weight,conviction,thesis,entry_price,target_price,stop_loss,instruments(symbol,name)")
      .order("as_of", { ascending: false })
      .limit(100);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    const rows: RecommendationView[] = data.map((r: Record<string, unknown>) => {
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
      passed: (r.avg_rr as number ?? 0) >= 1.3 && (r.win_rate as number ?? 0) >= 0.4,
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

// ── 리스크 (종목 상세) ── 파생 산출물 → 현재 심볼별 샘플
export async function getRisk(
  _instrumentId: number,
  symbol = "",
): Promise<Loaded<RiskView>> {
  return { data: sampleRiskFor(symbol), isSample: true };
}
