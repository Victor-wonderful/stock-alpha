// 기본은 공개(무쿠키·60초 캐시) 클라이언트. 쿠키를 읽으면 요청이 동적으로 확정돼
// fetch 캐시가 전부 무효화되므로, 세션이 실제로 필요한 곳에서만 createUserClient 를 쓴다.
import { createPublicClient } from "@/lib/supabase/public";
import { createClient as createUserClient } from "@/lib/supabase/server";
import type { TradeSetup, TradeStyle } from "@stock-alpha/db";
import {
  computePositionSizePct,
  DEFAULT_RISK_PER_TRADE_PCT,
} from "./position";
import { computeSnowflake, type SnowflakeResult } from "./snowflake";
import type { EventEvidence } from "./events";
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
export async function getUserRiskPct(): Promise<number> {
  try {
    // 여기만 로그인 세션이 필요하다 — 쿠키 클라이언트 유지(캐시 대상 아님).
    const supabase = await createUserClient();
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

export type DisclosureView = {
  id: number;
  symbol: string | null;
  name: string | null;
  reportName: string;
  eventType: string | null;
  direction: "positive" | "negative" | "neutral" | null;
  receiptDate: string;
};

// 최신 공시일의 이벤트 공시를 방향별로 묶어 반환.
// 엔진(engine/ingest/dart.py)이 DART 에서 매일 긁어 정기·미분류를 걸러내고
// event_type/direction 까지 붙여 disclosures 에 적재한다(2,845건 적재, 웹은 여태 미사용).
//
// 한 덩어리로 뽑아 자르면 특정 방향이 통째로 사라진다(초기 구현에서 악재 30건이
// limit 12 를 다 먹어 호재 36건이 화면에서 증발했다). 방향별로 따로 가져온다.
export async function getLatestDisclosures(perDirection = 40): Promise<
  Loaded<{
    asOf: string | null;
    positive: DisclosureView[];
    negative: DisclosureView[];
    neutral: DisclosureView[];
  }>
> {
  const empty = { asOf: null, positive: [], negative: [], neutral: [] };
  try {
    const supabase = createPublicClient();
    // 최신 접수일을 먼저 확정 — '오늘'이 휴장일 수 있어 날짜를 가정하지 않는다.
    const { data: head } = await supabase
      .from("disclosures")
      .select("rcept_dt")
      .order("rcept_dt", { ascending: false })
      .limit(1);
    const asOf = head?.[0]?.rcept_dt ?? null;
    if (!asOf) return { data: empty, isSample: false };

    const map = (rows: Record<string, unknown>[]): DisclosureView[] =>
      rows.map((r) => {
        const inst = (r.instruments ?? {}) as { symbol?: string; name?: string };
        return {
          id: Number(r.id),
          symbol: inst.symbol ?? null,
          name: inst.name ?? null,
          // DART report_nm 은 뒤에 공백이 잔뜩 붙어 온다.
          reportName: String(r.report_nm ?? "").trim(),
          eventType: (r.event_type as string) ?? null,
          direction: (r.direction as DisclosureView["direction"]) ?? null,
          receiptDate: String(r.rcept_dt),
        };
      });

    const pick = async (dir: string) => {
      const { data } = await supabase
        .from("disclosures")
        .select("id,report_nm,event_type,direction,rcept_dt,instruments(symbol,name)")
        .eq("rcept_dt", asOf)
        .eq("direction", dir)
        .limit(perDirection);
      return map((data ?? []) as Record<string, unknown>[]);
    };
    const [negative, neutral, positive] = await Promise.all([
      pick("negative"),
      pick("neutral"),
      pick("positive"),
    ]);
    return { data: { asOf, positive, negative, neutral }, isSample: false };
  } catch {
    return { data: empty, isSample: false };
  }
}

// 공시 유형별 성적표 — "이 소식 뒤에 실제로 어떻게 됐나".
// 엔진(engine/market/event_study.py)이 매일 계산해 event_evidence 에 적재한다.
// 화면의 "이 뉴스는 어떻다"는 문장은 전부 이 표를 근거로 한다.
export async function getEventEvidence(): Promise<Map<string, EventEvidence>> {
  const out = new Map<string, EventEvidence>();
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("event_evidence")
      .select("event_type,n,car_1d,car_5d,car_20d,win_20d,verdict")
      .eq("source", "disclosure")
      .limit(100);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.set(String(r.event_type), {
        eventType: String(r.event_type),
        n: Number(r.n ?? 0),
        car1d: r.car_1d == null ? null : Number(r.car_1d),
        car5d: r.car_5d == null ? null : Number(r.car_5d),
        car20d: r.car_20d == null ? null : Number(r.car_20d),
        win20d: r.win_20d == null ? null : Number(r.win_20d),
        verdict: (r.verdict as EventEvidence["verdict"]) ?? "insufficient",
      });
    }
  } catch {
    /* 근거가 없으면 공시는 그냥 목록으로 보여준다(기존 동작) */
  }
  return out;
}

export type NewsEvent = {
  symbol: string;
  date: string;             // YYYY-MM-DD (KST)
  outletCount: number;      // 그날 보도한 매체 수
  changePct: number | null; // 그날 등락(전일 종가 대비)
};

// 종목별 '사건' 탐지 — 기사 제목을 쓰지 않고 보도 밀도만으로 판단한다.
//
// 왜 제목을 안 쓰나: 기사 제목·본문은 언론사 저작물이고, 외부 링크는 사용자를 뺏기며,
// 제목을 VECTA 문장으로 옮기면 검증 책임까지 넘어온다.
//
// 왜 날짜 기준인가: 같은 사건을 다룬 한국어 제목은 어휘가 크게 달라 토큰 유사도로
// 안 묶인다(실측: NHN 목표가 상향 기사들의 공통 토큰이 '목표가' 하나뿐이라 유사도 0.14).
// 반면 '같은 날 여러 매체가 동시에 썼다'는 어휘와 무관하고 강건하다. 실측에서 NHN 8/12 은
// 7개 매체(2분기 실적·목표가 상향·급등)로 잡혔고, 안국약품·제닉은 전부 단독 기사로 갈렸다.
//
// 노이즈 제거: 네이버 종목뉴스는 업종 기사까지 섞어준다(안국약품 목록에
// '다이소로 몰려가는 제약사들'). 제목에 종목명이 없으면 버린다 — 실측 67건 중 40건(60%).
export async function getNewsEvents(
  symbols: string[],
  opts: { minOutlets?: number; days?: number } = {},
): Promise<Map<string, NewsEvent[]>> {
  const minOutlets = opts.minOutlets ?? 2;
  const days = opts.days ?? 10;
  const out = new Map<string, NewsEvent[]>();
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return out;

  try {
    const supabase = createPublicClient();
    const { data: insts } = await supabase
      .from("instruments")
      .select("id,symbol,name")
      .in("symbol", uniq);
    const meta = new Map<number, { symbol: string; name: string }>();
    for (const r of (insts ?? []) as { id: number; symbol: string; name: string }[]) {
      meta.set(Number(r.id), { symbol: r.symbol, name: r.name });
    }
    if (meta.size === 0) return out;

    const since = new Date(Date.now() - days * 864e5).toISOString();
    const { data } = await supabase
      .from("news")
      .select("instrument_id,headline,source,published_at")
      .in("instrument_id", [...meta.keys()])
      .gte("published_at", since)
      .limit(1000);

    const bucket = new Map<string, { iid: number; date: string; outlets: Set<string> }>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const iid = Number(r.instrument_id);
      const m = meta.get(iid);
      if (!m) continue;
      const headline = String(r.headline ?? "").replace(/\s/g, "");
      if (!headline.includes(m.name.replace(/\s/g, ""))) continue;
      const kst = new Date(new Date(String(r.published_at)).getTime() + 9 * 3600 * 1000);
      const date = kst.toISOString().slice(0, 10);
      const key = iid + "|" + date;
      const b = bucket.get(key) ?? { iid, date, outlets: new Set<string>() };
      b.outlets.add(String(r.source ?? "?"));
      bucket.set(key, b);
    }

    const events = [...bucket.values()].filter((b) => b.outlets.size >= minOutlets);
    if (events.length === 0) return out;

    // 그날 등락 — 사건 옆에 붙이는 유일한 해석이고, VECTA 가 직접 잰 값이다.
    const { data: bars } = await supabase
      .from("ohlcv")
      .select("instrument_id,ts,close")
      .eq("interval", "1d")
      .in("instrument_id", [...new Set(events.map((e) => e.iid))])
      .order("ts", { ascending: false })
      .limit(events.length * 40);
    const seriesByIid = new Map<number, { d: string; c: number }[]>();
    for (const b of (bars ?? []) as Record<string, unknown>[]) {
      const iid = Number(b.instrument_id);
      const arr = seriesByIid.get(iid) ?? [];
      arr.push({ d: String(b.ts).slice(0, 10), c: Number(b.close) });
      seriesByIid.set(iid, arr);
    }

    for (const e of events) {
      const m = meta.get(e.iid);
      if (!m) continue;
      const ser = seriesByIid.get(e.iid) ?? [];
      const i = ser.findIndex((x) => x.d === e.date);
      const changePct =
        i >= 0 && ser[i + 1] && ser[i + 1].c ? ser[i].c / ser[i + 1].c - 1 : null;
      const arr = out.get(m.symbol) ?? [];
      arr.push({ symbol: m.symbol, date: e.date, outletCount: e.outlets.size, changePct });
      out.set(m.symbol, arr);
    }
    for (const [, arr] of out) arr.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
  } catch {
    return out;
  }
}

// 셋업별 상위 N건 — 스크리너 기본 화면(셋업 섹션 뷰)용.
// 1000행 표 하나를 훑게 하는 대신 "오늘 어떤 셋업이 떴나"를 셋업별로 보여준다.
// 셋업당 소량이라 병렬 조회해도 가볍고, 60초 fetch 캐시가 걸린다.
export async function getSignalsBySetups(
  setups: string[],
  perSetup = 5,
): Promise<Map<string, SignalView[]>> {
  const out = new Map<string, SignalView[]>();
  try {
    const riskPct = await getUserRiskPct();
    const supabase = createPublicClient();
    const results = await Promise.all(
      setups.map(async (setup) => {
        const { data } = await supabase
          .from("signals")
          .select("*, instruments!inner(symbol,name,exchange,currency)")
          .eq("setup", setup)
          .order("strength", { ascending: false })
          .limit(perSetup);
        return (data ?? []).map((r) => mapSignal(r, riskPct));
      }),
    );
    setups.forEach((st, i) => out.set(st, results[i]));
    return out;
  } catch {
    return out;
  }
}

// 셋업별 정확한 시그널 건수 + 전체 건수.
//
// 왜 필요한가: 스크리너가 getSignals({},1000) 로 '강도 상위 1000건'만 받아 그 안에서
// 세었다. 전체는 2530건이라 강도가 낮은 셋업은 표본에서 통째로 잘려 0 으로 표시됐다
// (실측: 수급 매집 화면 0 vs 실제 303, 변동성 수축 20 vs 137, 돌파 263 vs 344).
// 사용자는 "오늘 그 셋업은 없구나" 로 읽고 실재하는 시그널을 놓친다.
//
// PostgREST 는 GROUP BY 가 없으므로 셋업별 head-count 를 병렬로 던진다.
// 칩에 실제로 그리는 셋업(7개)만 조회하고, 60초 fetch 캐시가 걸려 있어 반복 비용은 없다.
export async function getSignalCounts(
  setups: string[],
): Promise<{ total: number; bySetup: Map<string, number> }> {
  const bySetup = new Map<string, number>();
  try {
    const supabase = createPublicClient();
    const countOf = async (setup?: string) => {
      let q = supabase.from("signals").select("id", { count: "exact", head: true });
      if (setup) q = q.eq("setup", setup);
      const { count } = await q;
      return count ?? 0;
    };
    const [total, ...counts] = await Promise.all([
      countOf(),
      ...setups.map((st) => countOf(st)),
    ]);
    setups.forEach((st, i) => bySetup.set(st, counts[i]));
    return { total, bySetup };
  } catch {
    return { total: 0, bySetup };
  }
}

export async function getSignals(
  filters: SignalFilters = {},
  limit = 100,
  offset = 0,
): Promise<Loaded<SignalView[]> & { total: number }> {
  try {
    const supabase = createPublicClient();
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
    const supabase = createPublicClient();
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
    const supabase = createPublicClient();
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
    const supabase = createPublicClient();
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

// 카드용 미니 스노우플레이크 — 여러 종목의 5축을 벌크로(심볼당 호출 금지). 비싼 리스크
// 계산은 제외하고 lowvol 팩터로 안정성을 대체(경량). 실패 시 빈 Map → 카드가 미니를 생략.
export async function getSnowflakesForSymbols(
  symbols: string[],
): Promise<Map<string, SnowflakeResult>> {
  const out = new Map<string, SnowflakeResult>();
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return out;
  try {
    const supabase = createPublicClient();
    const { data: insts } = await supabase
      .from("instruments")
      .select("id,symbol")
      .in("symbol", uniq);
    if (!insts || insts.length === 0) throw new Error("no instruments");
    const idToSym = new Map<number, string>();
    const ids: number[] = [];
    for (const r of insts as { id: number; symbol: string }[]) {
      idToSym.set(r.id, r.symbol);
      ids.push(r.id);
    }

    // 종목별 '최신 1행' — instrument_id, date desc 정렬 후 첫 등장만 채택.
    const latestById = async (
      table: string,
      cols: string,
    ): Promise<Map<number, Record<string, number | null>>> => {
      const m = new Map<number, Record<string, number | null>>();
      const { data } = await supabase
        .from(table)
        .select(`instrument_id,${cols}`)
        .in("instrument_id", ids)
        .order("instrument_id", { ascending: true })
        .order("date", { ascending: false });
      for (const r of (data ?? []) as unknown as Record<string, number>[]) {
        const iid = r.instrument_id as number;
        if (!m.has(iid)) m.set(iid, r);
      }
      return m;
    };

    const [facM, valM] = await Promise.all([
      latestById("factor_scores", "value_z,momentum_z,growth_z,lowvol_z"),
      latestById("valuations", "roe,upside_pct"),
    ]);
    // 수급 — 종목별 최근 행들(외인·기관 순매수). instrument_id별 묶음.
    const flowsById = new Map<number, FlowRowView[]>();
    const { data: flowRows } = await supabase
      .from("flows")
      .select("instrument_id,foreign_net,inst_net")
      .in("instrument_id", ids)
      .order("instrument_id", { ascending: true })
      .order("date", { ascending: false })
      .limit(ids.length * 8);
    for (const r of (flowRows ?? []) as unknown as Record<string, number>[]) {
      const iid = r.instrument_id as number;
      const arr = flowsById.get(iid) ?? [];
      if (arr.length < 8) {
        arr.push({
          date: "",
          foreign_net: (r.foreign_net as number) ?? null,
          inst_net: (r.inst_net as number) ?? null,
          retail_net: null,
          short_volume: null,
        });
      }
      flowsById.set(iid, arr);
    }

    for (const iid of ids) {
      const sym = idToSym.get(iid)!;
      out.set(
        sym,
        computeSnowflake({
          val: (valM.get(iid) as never) ?? null,
          fac: (facM.get(iid) as never) ?? null,
          flows: flowsById.get(iid) ?? [],
          risk: null,
        }),
      );
    }
    return out;
  } catch {
    return out; // 부분/전체 실패 시 빈 Map — 카드는 미니 없이 정상 동작.
  }
}

export async function getSignalsForSymbol(
  symbol: string,
): Promise<Loaded<SignalView[]>> {
  // instrument_id 로 직접 조회 — 전역 시그널을 클라이언트 필터하면 1000행 제한·
  // 강도순 상위 절단으로 해당 종목을 놓칠 수 있음.
  try {
    const supabase = createPublicClient();
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
    const supabase = createPublicClient();

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
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("recommendations")
      .select("instrument_id,basket_type,style,weight,conviction,thesis,entry_price,target_price,tp2_price,stop_loss,as_of,setup,entry_rule,status,instruments(symbol,name)")
      .order("as_of", { ascending: false })
      .order("conviction", { ascending: false })
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
        instrument_id: (r.instrument_id as number | null) ?? null,
        basket_type: (r.basket_type as string) ?? "",
        style: r.style as RecommendationView["style"],
        symbol: (inst.symbol as string) ?? "",
        name: (inst.name as string) ?? "",
        weight: Number(r.weight ?? 0),
        conviction: Number(r.conviction ?? 0),
        thesis: (r.thesis as string) ?? "",
        entry_price: r.entry_price as number | null,
        target_price: r.target_price as number | null,
        tp2_price: r.tp2_price as number | null,
        stop_loss: r.stop_loss as number | null,
        as_of: (r.as_of as string) ?? null,
        setup: (r.setup as string) ?? null,
        entry_rule: (r.entry_rule as string) ?? null,
        status: (r.status as string) ?? null,
      };
    });
    return { data: rows, isSample: false };
  } catch {
    return { data: SAMPLE_RECS, isSample: true };
  }
}

// ── 포트폴리오 진단 (피벗 2축 — 자동화된 일반 로직, 입력 미저장) ──
export interface HoldingInput {
  symbol: string;
  weight: number; // 0~1 (정규화 후)
}
export interface HoldingDiagnosis {
  symbol: string;
  name: string;
  sector: string | null;
  weight: number;
  last_close: number | null; // 최신 종가
  change_pct: number | null; // 전일 대비
  rating: string | null; // 최신 리포트 판정 (없으면 null)
  score: number | null; // 종합 점수
  composite_alpha: number | null;
  upside_pct: number | null;
  beta: number | null;
  vol_annual: number | null;
  report_id: number | null;
  warnings: string[];
}
export interface PortfolioDiagnosis {
  holdings: HoldingDiagnosis[];
  notFound: string[];
  weighted_alpha: number | null;
  weighted_beta: number | null;
  weighted_vol: number | null;
  top_sector: { sector: string; weight: number } | null;
  sectors: { sector: string; weight: number }[]; // 비중 내림차순 — 섹터 배분 도넛용
  warnings: string[];
}

export async function getPortfolioDiagnosis(
  items: HoldingInput[],
): Promise<PortfolioDiagnosis> {
  const supabase = createPublicClient();
  const holdings: HoldingDiagnosis[] = [];
  const notFound: string[] = [];

  // 종목코드(6자리) 또는 종목명 어느 쪽이든 해석.
  // 이름은 정확 일치 → 부분 일치(유일할 때만) 순서. 모호하면 notFound 로 안내.
  async function resolveInstrument(term: string) {
    const t = term.trim();
    if (/^\d{6}$/.test(t)) {
      const { data } = await supabase
        .from("instruments")
        .select("id,symbol,name,sector,active")
        .eq("symbol", t)
        .limit(1);
      return data?.[0] ?? null;
    }
    const { data: exact } = await supabase
      .from("instruments")
      .select("id,symbol,name,sector,active")
      .eq("name", t)
      .limit(2);
    if (exact && exact.length >= 1) return exact[0];
    const { data: partial } = await supabase
      .from("instruments")
      .select("id,symbol,name,sector,active")
      .ilike("name", `%${t}%`)
      .eq("active", true)
      .limit(2);
    if (partial && partial.length === 1) return partial[0];
    return null; // 없음 또는 모호(2건 이상)
  }

  for (const it of items) {
    const inst = await resolveInstrument(it.symbol);
    if (!inst) {
      notFound.push(it.symbol);
      continue;
    }
    const [price, fac, val, risk, rep] = await Promise.all([
      getLatestPrice(inst.id),
      supabase
        .from("factor_scores")
        .select("composite_alpha")
        .eq("instrument_id", inst.id)
        .order("date", { ascending: false })
        .limit(1),
      supabase
        .from("valuations")
        .select("upside_pct")
        .eq("instrument_id", inst.id)
        .order("date", { ascending: false })
        .limit(1),
      supabase
        .from("risk_metrics")
        .select("beta,vol_annual")
        .eq("instrument_id", inst.id)
        .order("date", { ascending: false })
        .limit(1),
      supabase
        .from("reports")
        .select("id,rating,payload")
        .eq("instrument_id", inst.id)
        .eq("report_type", "indepth")
        .eq("status", "published")
        .order("as_of", { ascending: false })
        .limit(1),
    ]);
    const report = rep.data?.[0] as Record<string, unknown> | undefined;
    const payload = (report?.payload as Record<string, unknown>) ?? undefined;
    const verdict = (payload?.verdict as Record<string, unknown>) ?? undefined;
    const gateChecks =
      ((payload?.tradability as Record<string, unknown>)?.checks as
        | { key: string; passed: boolean }[]
        | undefined) ?? [];
    const h: HoldingDiagnosis = {
      symbol: inst.symbol,
      name: inst.name,
      sector: inst.sector ?? null,
      weight: it.weight,
      last_close: price.data?.close ?? null,
      change_pct: price.data?.changePct ?? null,
      rating: (report?.rating as string) ?? null,
      score: verdict?.score != null ? Number(verdict.score) : null,
      composite_alpha: fac.data?.[0]?.composite_alpha ?? null,
      upside_pct: val.data?.[0]?.upside_pct ?? null,
      beta: risk.data?.[0]?.beta ?? null,
      vol_annual: risk.data?.[0]?.vol_annual ?? null,
      report_id: (report?.id as number) ?? null,
      warnings: [],
    };
    if (!inst.active) h.warnings.push("비활성 종목(관리/상폐 가능성)");
    // 게이트 체크별 구분 — 종목 자체의 위험(①~③)만 보유 경고로.
    // ④(검증 시그널 부재)는 "신규 진입 근거 없음"이지 보유 위험이 아님.
    const failed = new Set(gateChecks.filter((c) => !c.passed).map((c) => c.key));
    if (failed.has("liquidity")) h.warnings.push("유동성 부족(거래대금 1억 미만)");
    if (failed.has("volatility")) h.warnings.push("변동성 과열(ATR 12% 초과)");
    if (failed.has("active")) h.warnings.push("거래 제한 종목(ETF/스팩/비활성)");
    if (it.weight > 0.3) h.warnings.push("단일 종목 비중 30% 초과");
    if (h.vol_annual != null && h.vol_annual > 0.6)
      h.warnings.push("연 변동성 60% 초과(고위험)");
    holdings.push(h);
  }

  const wsum = holdings.reduce((a, h) => a + h.weight, 0) || 1;
  const wavg = (f: (h: HoldingDiagnosis) => number | null): number | null => {
    let acc = 0;
    let w = 0;
    for (const h of holdings) {
      const v = f(h);
      if (v != null) {
        acc += v * h.weight;
        w += h.weight;
      }
    }
    return w > 0 ? acc / w : null;
  };

  const bySector = new Map<string, number>();
  for (const h of holdings) {
    const s = h.sector ?? "미분류";
    bySector.set(s, (bySector.get(s) ?? 0) + h.weight / wsum);
  }
  const top = [...bySector.entries()].sort((a, b) => b[1] - a[1])[0];

  const warnings: string[] = [];
  if (top && top[1] > 0.5)
    warnings.push(`섹터 집중 — ${top[0]} 비중 ${(top[1] * 100).toFixed(0)}%`);
  const wbeta = wavg((h) => h.beta);
  if (wbeta != null && wbeta > 1.3)
    warnings.push(`포트폴리오 베타 ${wbeta.toFixed(2)} — 시장 대비 고위험`);
  const risky = holdings.filter((h) =>
    h.warnings.some((w) => w.startsWith("유동성") || w.startsWith("변동성") || w.startsWith("거래 제한")),
  ).length;
  if (risky > 0)
    warnings.push(`유동성·변동성·거래제한 주의 종목 ${risky}개 보유`);

  return {
    holdings,
    notFound,
    weighted_alpha: wavg((h) => h.composite_alpha),
    weighted_beta: wbeta,
    weighted_vol: wavg((h) => h.vol_annual),
    top_sector: top ? { sector: top[0], weight: top[1] } : null,
    sectors: [...bySector.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sector, weight]) => ({ sector, weight })),
    warnings,
  };
}

// ── 모닝 브리프 (report_type='market') ──
// 시장 폭 + 조건부 실측 — 엔진 engine/market/breadth.py 산출.
// '예측'이 아니라 '과거 빈도'다. up_rate 를 보여줄 땐 baseline 을 반드시 함께 —
// 조건 없이 세도 절반 이상 오르는 시장이라, 기준선이 빠지면 시스템 실력으로 읽힌다.
export interface MarketCondition {
  /** 완결된 한 문장(예: "간밤에 미국 공포지수가 올랐습니다") — 화면이 그대로 이어 붙인다. */
  condition: string;
  n: number;                  // 과거 성립 횟수 (표본)
  up_count_1d?: number;       // 그중 다음날 오른 횟수 — 비율보다 이게 잘 읽힌다
  sample_1d?: number;
  up_rate_1d?: number;
  avg_ret_1d?: number;
  up_rate_5d?: number;
  avg_ret_5d?: number;
}

export interface MarketBreadth {
  as_of: string;
  market_ret: number;         // 전 종목 동일가중 일간 수익률
  breadth: number;            // 오른 종목 비율 0~1
  advancers: number;
  decliners: number;
  unchanged: number;
  instruments: number;
  prev_breadth: number | null;
  baseline: {
    n: number;
    up_rate_1d: number | null;
    avg_ret_1d: number | null;
    up_rate_5d: number | null;
    avg_ret_5d: number | null;
  };
  conditions: MarketCondition[];
  lookback_days: number;
}

export interface MorningBrief {
  as_of: string;
  headline: string;
  market_view: string;
  watchpoints: string[];
  regime: { regime: string; score: number; drivers: string[] } | null;
  market: MarketBreadth | null;
  macro: {
    series: string;
    label: string;
    value: number;
    change_pct: number | null;
  }[];
  created_at: string;
}

// 4국면 시장 상태 — market_regime 최신행 직접 읽기(모닝브리프 payload 와 별개).
// market_state 미상(구버전 레짐)이면 regime 으로 폴백 추론.
export interface MarketStateView {
  regime: string;
  score: number;
  market_state: string | null; // uptrend|downtrend|range|transition
  structure: string | null;
  drivers: string[];
}

export async function getMarketState(): Promise<MarketStateView | null> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("market_regime")
      .select("regime,score,drivers,market_state,structure")
      .order("date", { ascending: false })
      .limit(1)
      .single();
    if (!data) return null;
    const regime = (data.regime as string) ?? "neutral";
    // 폴백 — market_state 없으면 regime 으로 추론(상승/하락/중립).
    const fallback =
      regime === "risk_off" ? "downtrend" : regime === "risk_on" ? "uptrend" : "transition";
    return {
      regime,
      score: Number(data.score ?? 0),
      market_state: (data.market_state as string) ?? fallback,
      structure: (data.structure as string) ?? null,
      drivers: (data.drivers as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

// ── 시장 캘린더 ───────────────────────────────────────────────────────
// 예정된 일정만 담긴다(만기·리밸런싱·정책일). 돌발 뉴스는 여기가 아니라 '사건'이다.
export type CalendarEvent = {
  date: string;
  kind: string;
  title: string;
  region: string;
  severity: number;
  instrument_id: number | null;
  block_entry: boolean;
  block_days_before: number;
  d_day: number;
};

// 앞으로 N일 일정. 휴장은 일정이 아니라 달력이라 제외한다.
export async function getUpcomingEvents(
  from: string,
  days = 7,
): Promise<CalendarEvent[]> {
  try {
    const supabase = createPublicClient();
    const to = new Date(new Date(from + "T00:00:00Z").getTime() + days * 864e5)
      .toISOString()
      .slice(0, 10);
    const { data } = await supabase
      .from("market_calendar")
      .select(
        "date,kind,title,region,severity,instrument_id,block_entry,block_days_before",
      )
      .neq("kind", "holiday")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .limit(100);
    const base = Date.parse(from + "T00:00:00Z");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      date: String(r.date),
      kind: String(r.kind),
      title: String(r.title),
      region: String(r.region ?? "KR"),
      severity: Number(r.severity ?? 1),
      instrument_id: r.instrument_id == null ? null : Number(r.instrument_id),
      block_entry: Boolean(r.block_entry),
      block_days_before: Number(r.block_days_before ?? 0),
      d_day: Math.round((Date.parse(String(r.date) + "T00:00:00Z") - base) / 864e5),
    }));
  } catch {
    return [];
  }
}

// 이벤트 종류별 실측 반응 — "그래서 무슨 영향인데"의 답.
// 통념이 아니라 우리 일봉으로 잰 값이다(engine.market.calendar_impact).
export type CalendarImpact = {
  kind: string;
  n: number;
  dispersion: number | null;
  baseDispersion: number | null;
  meanReturn: number | null;
  baseReturn: number | null;
};

export async function getCalendarImpacts(): Promise<Map<string, CalendarImpact>> {
  const out = new Map<string, CalendarImpact>();
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("calendar_impact")
      .select("kind,n,dispersion,base_dispersion,mean_return,base_return")
      .limit(50);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.set(String(r.kind), {
        kind: String(r.kind),
        n: Number(r.n ?? 0),
        dispersion: r.dispersion == null ? null : Number(r.dispersion),
        baseDispersion: r.base_dispersion == null ? null : Number(r.base_dispersion),
        meanReturn: r.mean_return == null ? null : Number(r.mean_return),
        baseReturn: r.base_return == null ? null : Number(r.base_return),
      });
    }
  } catch {
    /* 측정값이 없어도 일정은 보여준다 */
  }
  return out;
}

// 분석일 다음 거래일 — 휴장일 표를 DB 에서 읽어 확정한다.
//
// 확정할 수 없으면 null 이고, 호출부는 그때 "다음 거래일"로 뭉뚱그린다. 언제 확정
// 가능한가: 캘린더의 휴장 목록은 과거를 ohlcv 로 역산해 만든다 — 즉 미래는 모른다.
// 그래서 "이 날짜까지는 휴장 목록이 완전하다"는 마커(kind='coverage')를 사람이 두고,
// 그 기한 안에서만 날짜를 단정한다. 마커가 없으면 영영 흐린 채로 둔다 — 틀린 날짜를
// 자신 있게 쓰는 것보다 낫다(광복절이 토요일이면 월요일이 대체공휴일이 된다).
export async function getNextTradingDay(asOf: string): Promise<string | null> {
  try {
    const supabase = createPublicClient();
    const to = new Date(Date.parse(asOf + "T00:00:00Z") + 30 * 864e5)
      .toISOString()
      .slice(0, 10);
    const { data: marker } = await supabase
      .from("market_calendar")
      .select("date")
      .eq("event_key", "holiday-coverage")
      .limit(1);
    const confirmedThrough = marker?.[0]?.date ? String(marker[0].date) : null;
    if (!confirmedThrough || confirmedThrough <= asOf) return null;

    const { data } = await supabase
      .from("market_calendar")
      .select("date")
      .eq("kind", "holiday")
      .gt("date", asOf)
      .lte("date", to)
      .limit(60);

    const holidays = new Set(((data ?? []) as { date: string }[]).map((r) => String(r.date)));
    const d = new Date(Date.parse(asOf + "T00:00:00Z"));
    for (let i = 0; i < 30; i++) {
      d.setUTCDate(d.getUTCDate() + 1);
      const iso = d.toISOString().slice(0, 10);
      // 확정 기한을 넘어서면 답하지 않는다 — 그 너머의 휴장은 표에 없을 뿐 없는 게 아니다.
      if (iso > confirmedThrough) return null;
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6 && !holidays.has(iso)) return iso;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getMorningBrief(): Promise<Loaded<MorningBrief | null>> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("reports")
      .select("as_of,summary,payload,created_at")
      .eq("report_type", "market")
      .eq("status", "published")
      .order("as_of", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) throw error ?? new Error("none");
    const row = data[0] as Record<string, unknown>;
    const p = (row.payload ?? {}) as Record<string, unknown>;
    const n = (p.narrative ?? {}) as Record<string, unknown>;
    return {
      data: {
        as_of: row.as_of as string,
        headline: (n.headline as string) ?? (row.summary as string) ?? "",
        market_view: (n.market_view as string) ?? "",
        watchpoints: (n.watchpoints as string[]) ?? [],
        regime: (p.regime as MorningBrief["regime"]) ?? null,
        market: (p.market as MarketBreadth) ?? null,
        macro: (p.macro as MorningBrief["macro"]) ?? [],
        created_at: (row.created_at as string) ?? "",
      },
      isSample: false,
    };
  } catch {
    return { data: null, isSample: false };
  }
}

// ── 주간 브리핑 (홈 주간 브리핑 섹션의 폴백) ──
// 블로그의 view/weekly 글이 우선이고, 없으면 엔진이 발행한 주간 브리핑을 쓴다
// (engine/reports/weekly.py — 제목을 그 주의 측정값에서 규칙으로 뽑는다).
// 읽는 시간 자리에는 그 주의 시장 수익률을 놓는다 — 기계 요약에 "8분"은 거짓말이다.
export interface WeeklyReport {
  as_of: string;       // 그 주의 마지막 거래일
  title: string;
  summary: string | null;
  market_ret: number | null;
}

export async function getWeeklyReports(limit = 3): Promise<WeeklyReport[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("reports")
      .select("as_of,title,summary,payload")
      .eq("report_type", "weekly")
      .eq("status", "published")
      .order("as_of", { ascending: false })
      .limit(limit);
    if (error || !data) throw error ?? new Error("none");
    return (data as Record<string, unknown>[]).map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      const ret = p.market_ret;
      return {
        as_of: (r.as_of as string) ?? "",
        title: (r.title as string) ?? "",
        summary: (r.summary as string) ?? null,
        market_ret: typeof ret === "number" ? ret : null,
      };
    });
  } catch {
    return [];
  }
}

// ── 매크로 지표 (홈 매크로 섹션의 폴백) ──
// 홈 매크로 섹션은 원래 블로그의 view/macro 글을 진열한다. 다만 그 글이 아직 0편이라
// 섹션 자체가 사라졌다(2026-08-20). 세 섹션은 홈의 뼈대라 자리가 비면 안 되므로,
// 글이 없는 동안은 같은 행 형태로 «지표»를 보여준다. 글이 생기면 글이 이긴다.
export async function getMacroSeries(exclude: string[] = []): Promise<MacroSeriesView[]> {
  try {
    const supabase = createPublicClient();
    const ids = Object.keys(MACRO_META).filter((id) => !exclude.includes(id));
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("macro")
      .select("series_id,date,value")
      .in("series_id", ids)
      .order("date", { ascending: true });
    if (error || !data) throw error ?? new Error("none");
    const bySeries = new Map<string, { date: string; value: number }[]>();
    for (const row of data as { series_id: string; date: string; value: number }[]) {
      const arr = bySeries.get(row.series_id) ?? [];
      arr.push({ date: row.date, value: Number(row.value) });
      bySeries.set(row.series_id, arr);
    }
    const out: MacroSeriesView[] = [];
    for (const id of ids) {
      const arr = bySeries.get(id);
      if (!arr || arr.length === 0) continue;
      const last = arr[arr.length - 1];
      const prev = arr.length > 1 ? arr[arr.length - 2] : last;
      out.push({
        series_id: id,
        label: MACRO_META[id].label,
        value: last.value,
        unit: MACRO_META[id].unit,
        change: last.value - prev.value,
        spark: arr.slice(-30).map((r) => r.value),
        as_of: last.date,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── 블로그 글 (홈 3섹션) ──
// 주간 브리핑·매크로·기업 분석은 «글»이다. 이 터미널은 글을 쓰지 않는다 — vecta-blog 가 쓴다.
// 그래서 여기서 만들어내지 않고 블로그의 목록 피드(/posts.json)를 읽어 진열만 한다.
// 글은 한 곳에서만 쓰이고 두 사이트가 공유한다.
//
// 블로그가 아직 안 떠 있거나(로컬 미기동) 응답이 이상하면 빈 배열이다 —
// 그 경우 홈의 해당 섹션은 아예 렌더되지 않는다(없는 걸 있는 척하지 않는다).
export interface BlogPost {
  slug: string;
  category: string;
  categoryLabel: string;
  sub: string;
  subLabel: string;
  title: string;
  summary: string;
  publishedAt: string;
  readingMinutes: number;
  url: string;
}

// 서버 컴포넌트에서만 읽는다 → NEXT_PUBLIC_ 접두사를 쓰지 않는다.
// 접두사를 붙이면 빌드에 값이 박히고 브라우저 번들에도 실린다. 둘 다 불필요하다.
//
// 기본값을 두지 않는다. 블로그는 2026-08-20 기준 아직 배포 전이라, 기본값을
// localhost 로 두면 Vercel 이 매 재검증마다 자기 자신의 localhost 로 헛왕복을 한다
// (반드시 실패하고 반드시 빈 배열이 되는 요청). 주소가 없으면 «아직 연결 안 됨»으로
// 보고 요청 자체를 하지 않는다.
const BLOG_URL = (process.env.BLOG_URL ?? "").trim().replace(/\/$/, "");

export async function getBlogPosts(): Promise<BlogPost[]> {
  if (!BLOG_URL) return []; // 블로그 미연결 — 홈의 3섹션은 렌더되지 않는다
  try {
    // 글은 하루 몇 번 바뀔까 말까다. 10분 캐시면 충분하고, 블로그가 죽어 있어도
    // 홈이 매 요청마다 그 왕복을 기다리지 않는다.
    const res = await fetch(`${BLOG_URL}/posts.json`, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { posts?: BlogPost[] };
    if (!Array.isArray(json.posts)) throw new Error("shape");
    return json.posts;
  } catch {
    return [];
  }
}

/** 카테고리·하위분류로 골라 최신순 N건. 홈 세 섹션이 각각 한 번씩 부른다. */
export function pickBlogPosts(
  posts: BlogPost[],
  category: string,
  sub: string,
  limit = 3,
): BlogPost[] {
  return posts
    .filter((p) => p.category === category && p.sub === sub)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

// ── 픽 기록 (실발행 트랙레코드) ──
// 발행한 모든 daily_focus 픽의 진입가 대비 현재가·상태를 읽기 시점에 계산.
// 종가 기반(장중 터치 미반영) — 목표/손절 "도달"은 종가 기준 근사임을 화면에 고지.
export interface PickRecord {
  as_of: string;
  symbol: string;
  name: string;
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  last_close: number | null;
  return_pct: number | null; // 진입가 대비 (확정 픽은 청산가 기준)
  status:
    | "진입 대기"   // 다음 거래일 시가 매수 예정 — 아직 안 샀다(레벨은 예상값)
    | "진행중"
    | "목표 도달"
    | "손절"
    | "만료"
    | "1차 익절"
    | "미체결"
    | "취소"       // 갭으로 손절폭이 최소치 아래 → 진입 조건이 무너져 안 삼
    | "—";
  closed: boolean; // 엔진이 확정 기록한 픽인지(0017) — 표시 구분용
  closed_at?: string | null; // 청산일 — 포지션 합산(보유 창) 판정용
  reselects?: number; // 같은 포지션이 여러 날 재선정된 횟수(>1이면 '연속 선정' 표시)
}

const PICK_STATUS_LABELS: Record<string, PickRecord["status"]> = {
  target: "목표 도달",
  stopped: "손절",
  expired: "만료",
  partial: "1차 익절", // 분할익절 후 본전 청산(0022) — 부분 수익 실현
  // 진입가에 끝내 닿지 않아 «살 수가 없었던» 픽(2026-08-20). 거래가 없었으므로
  // 손익도 없다 — 승률 계산에서 분모·분자 어디에도 넣지 않는다.
  unfilled: "미체결",
  // 진입을 «다음 거래일 시가»로 바꾼 뒤(2026-08-21) 생긴 두 상태.
  // pending 은 «아직 안 산» 계획이다 — 확정 기록이 아니므로 승률·수익률 집계에서
  // 빼야 한다. voided 는 갭으로 손절폭이 최소치 아래가 돼 사지 않은 것(거래 없음).
  pending: "진입 대기",
  voided: "취소",
};

// 아직 «거래가 아닌» 상태 — 성과 집계의 분모·분자 어디에도 넣지 않는다.
export const NON_TRADE_PICK_STATUSES = new Set(["진입 대기", "미체결", "취소"]);

// 진행중인 픽 — "어제 추천 보고 산 게 지금 어떻게 됐나".
//
// 홈에 이 블록이 없었다. 추천 목록만 있고 그 추천들이 지금 어디쯤 와 있는지는
// 다른 페이지로 가야 볼 수 있었는데, 매일 오는 사용자에게는 이게 새 추천만큼 중요하다.
//
// getPickHistory 를 쓰지 않는 이유: 그 함수는 픽마다 getLatestPrice 를 따로 부른다
// (28건이면 왕복 28회). 여기선 종목 가격을 한 번에 가져온다.
export type OpenPick = {
  symbol: string;
  name: string;
  asOf: string;
  heldDays: number;          // 발행일로부터 경과 거래일이 아닌 달력일
  entry: number | null;
  target: number | null;
  stop: number | null;
  last: number | null;
  returnPct: number | null;  // 진입가 대비
  toTargetPct: number | null;  // 현재가에서 목표까지 남은 거리
  toStopPct: number | null;    // 현재가에서 손절까지 남은 거리(양수 = 아직 여유)
  tp1Hit: boolean;
};

export async function getOpenPicks(limit = 30): Promise<OpenPick[]> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("recommendations")
      .select(
        "as_of,entry_price,target_price,tp2_price,stop_loss,tp1_hit,instruments(symbol,name)",
      )
      .eq("basket_type", "daily_focus")
      .eq("status", "open")
      .order("as_of", { ascending: false })
      .limit(limit);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return [];

    const picks = rows.map((r) => {
      const inst = (r.instruments ?? {}) as Record<string, unknown>;
      return {
        symbol: (inst.symbol as string) ?? "",
        name: (inst.name as string) ?? "",
        asOf: String(r.as_of),
        entry: (r.entry_price as number) ?? null,
        // 1차 익절한 픽은 잔량 목표가 tp2 로 바뀐다(0022 스케일아웃).
        target: (r.tp1_hit ? (r.tp2_price as number) : (r.target_price as number)) ?? null,
        stop: (r.stop_loss as number) ?? null,
        tp1Hit: Boolean(r.tp1_hit),
      };
    });

    const priceMap = await getLatestPricesBySymbols(picks.map((p) => p.symbol));
    const today = Date.now();
    return picks
      .map((p) => {
        const last = priceMap.get(p.symbol)?.close ?? null;
        const pct = (from: number | null, to: number | null) =>
          from != null && from > 0 && to != null ? to / from - 1 : null;
        return {
          ...p,
          last,
          heldDays: Math.max(
            0,
            Math.round((today - Date.parse(p.asOf + "T00:00:00Z")) / 864e5),
          ),
          returnPct: pct(p.entry, last),
          toTargetPct: pct(last, p.target),
          toStopPct: pct(last, p.stop),
        };
      })
      // 같은 종목이 여러 날 발행되면 홈에 같은 이름이 두 번 뜬다(NHN 이 2일·3일차로
      // 나란히 나왔다). 종목당 가장 최근 발행분만 남긴다 — 사용자에겐 한 자리다.
      .filter((p, _i, all) => all.find((q) => q.symbol === p.symbol) === p)
      // 손절에 가까운 것부터. toStopPct 는 '현재가에서 손절까지'라 롱에선 음수이고,
      // 0 에 가까울수록 코앞이다 — 내림차순이 '가까운 순'이다(오름차순은 정반대).
      .sort((a, b) => (b.toStopPct ?? -99) - (a.toStopPct ?? -99));
  } catch {
    return [];
  }
}

export async function getPickHistory(limit = 60): Promise<Loaded<PickRecord[]>> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("recommendations")
      .select(
        "as_of,entry_price,target_price,tp2_price,stop_loss,tp1_hit,instrument_id,status,closed_at,exit_price,close_return_pct,instruments(symbol,name)",
      )
      .eq("basket_type", "daily_focus")
      .order("as_of", { ascending: false })
      .limit(limit);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");

    const rows: PickRecord[] = await Promise.all(
      (data as Record<string, unknown>[]).map(async (r) => {
        const inst = (r.instruments ?? {}) as Record<string, unknown>;
        const entry = r.entry_price as number | null;
        const target = r.target_price as number | null;
        const stop = r.stop_loss as number | null;
        const base = {
          as_of: r.as_of as string,
          symbol: (inst.symbol as string) ?? "",
          name: (inst.name as string) ?? "",
          entry_price: entry,
          target_price: target,
          stop_loss: stop,
          closed_at: (r.closed_at as string) ?? null,
        };

        // 엔진이 확정(0017)한 픽 — 기록된 청산가/수익률 그대로 (트랙레코드)
        const stored = r.status as string;
        // 진입 대기(pending)는 «확정 기록»이 아니다 — 다음 거래일 시가에 살 계획이고
        // 화면의 손절·목표는 예상값이다. closed 로 넘기면 청산된 픽처럼 집계된다.
        if (stored === "pending") {
          return {
            ...base,
            last_close: null,
            return_pct: null,
            status: "진입 대기" as const,
            closed: false,
          };
        }
        if (stored && stored !== "open") {
          return {
            ...base,
            last_close: (r.exit_price as number) ?? null,
            return_pct: (r.close_return_pct as number) ?? null,
            status: PICK_STATUS_LABELS[stored] ?? "—",
            closed: true,
          };
        }

        // 열린 픽 — 읽기 시점 최신 종가로 추정 표시.
        // 분할익절(0022): 이미 1차 익절(tp1_hit)한 진행 픽은 본전(entry)스톱·tp2 목표
        // 기준으로 추정 — 잔량이 본전 밑이면 1차 익절(부분 수익 확정) 상태.
        const tp2 = r.tp2_price as number | null;
        const tp1Hit = Boolean(r.tp1_hit);
        const price = await getLatestPrice(r.instrument_id as number);
        const last = price.data?.close ?? null;
        const ret =
          entry != null && entry > 0 && last != null ? last / entry - 1 : null;
        const effStop = tp1Hit && entry != null ? entry : stop;
        const effTarget = tp1Hit && tp2 != null ? tp2 : target;
        let status: PickRecord["status"] = "—";
        if (last != null && entry != null) {
          if (effStop != null && last <= effStop) status = tp1Hit ? "1차 익절" : "손절";
          else if (effTarget != null && last >= effTarget) status = "목표 도달";
          else status = "진행중";
        }
        return { ...base, last_close: last, return_pct: ret, status, closed: false };
      }),
    );

    // 중복 제거 — 같은 종목의 연속 재선정을 '하나의 포지션'으로 합산(진행중·종결 공통).
    // 모델: 첫 픽(진입)부터 청산까지 한 포지션. 보유 중 재선정(같은 포지션 재확인)은
    // 흡수하고, 청산 이후 다시 픽되면 별개 포지션. 손익·손절률 중복집계 방지(정직한 통계).
    // 포지션 대표 = 첫 픽(최초 진입가·청산 결과). reselects = 흡수한 재선정 수.
    const bySymbol = new Map<string, PickRecord[]>();
    for (const r of rows) {
      const arr = bySymbol.get(r.symbol);
      if (arr) arr.push(r);
      else bySymbol.set(r.symbol, [r]);
    }
    const positions: PickRecord[] = [];
    for (const picks of bySymbol.values()) {
      picks.sort((a, b) => a.as_of.localeCompare(b.as_of)); // 오래된 순
      let cur: PickRecord | null = null;
      for (const p of picks) {
        // 현재 포지션 보유 창 안의 재선정인가 — 열려있거나(청산일 없음) 청산일 이전/당일
        const within =
          cur != null && (cur.closed_at == null || p.as_of <= cur.closed_at);
        if (within && cur) {
          cur.reselects = (cur.reselects ?? 1) + 1;
        } else {
          cur = { ...p, reselects: 1 };
          positions.push(cur);
        }
      }
    }
    const deduped = positions.sort((a, b) => b.as_of.localeCompare(a.as_of));
    return { data: deduped, isSample: false };
  } catch {
    return { data: [], isSample: false };
  }
}

// ── 전략·백테스트 ──
// backtests.params.walkforward → 화면용 요약. 엔진이 게이트 평가 시 적재한다.
// 구버전 행(params 없음/구조 다름)은 null — 화면은 사유 없이 '미통과'만 보인다.
function extractWalkforward(params: unknown): BacktestView["walkforward"] {
  if (!params || typeof params !== "object") return null;
  const wf = (params as Record<string, unknown>).walkforward;
  if (!wf || typeof wf !== "object") return null;
  const w = wf as Record<string, unknown>;
  if (typeof w.ok !== "boolean") return null;
  return {
    ok: w.ok,
    evaluable: w.evaluable === true,
    reason: typeof w.reason === "string" ? w.reason : null,
    recent_expectancy_r:
      typeof w.recent_expectancy_r === "number" ? w.recent_expectancy_r : null,
  };
}

export async function getBacktests(): Promise<Loaded<BacktestView[]>> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("backtests")
      .select(
        "setup,style,ic,sharpe,mdd,turnover,win_rate,avg_rr,expectancy_r,passed,period,params,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    // 셋업별 최신 런만 — 백테스트는 재실행마다 행이 쌓이므로(이력 보존),
    // 화면에는 현행 판정 하나만. 과거 런 혼재는 모순된 PASS/FAIL 로 보임.
    const seen = new Set<string>();
    const latest = (data as Record<string, unknown>[]).filter((r) => {
      const key = `${r.setup}|${r.style ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const rows: BacktestView[] = latest.map((r: Record<string, unknown>) => ({
      setup: r.setup as BacktestView["setup"],
      style: r.style as BacktestView["style"],
      ic: r.ic as number | null,
      sharpe: r.sharpe as number | null,
      mdd: r.mdd as number | null,
      turnover: r.turnover as number | null,
      win_rate: r.win_rate as number | null,
      avg_rr: r.avg_rr as number | null,
      expectancy_r: (r.expectancy_r as number) ?? null,
      period: r.period as string | null,
      verified_at: ((r.created_at as string) ?? "").slice(0, 10) || null,
      walkforward: extractWalkforward(r.params),
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
    const supabase = createPublicClient();
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
    const supabase = createPublicClient();
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
    const supabase = createPublicClient();
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

// ── 리포트별 매매 플랜 조합 (벌크) ──
// 목록 API(getReports)는 payload 를 안 싣는다. "이 종목에 검증 통과한 플랜이 있나"를
// 판정해야 하는 화면(반등 대기 리스트)용으로 (setup,style) 만 뽑아 온다.
export async function getPlanCombosForReports(
  ids: number[],
): Promise<Map<number, { setup: string; style: string }[]>> {
  const out = new Map<number, { setup: string; style: string }[]>();
  if (ids.length === 0) return out;
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("reports")
      .select("id,plan:payload->plan")
      .in("id", ids);
    for (const r of (data ?? []) as { id: number; plan: unknown }[]) {
      const plan = Array.isArray(r.plan) ? r.plan : [];
      out.set(
        Number(r.id),
        plan
          .map((p) => p as Record<string, unknown>)
          .filter((p) => typeof p?.setup === "string" && typeof p?.style === "string")
          .map((p) => ({ setup: String(p.setup), style: String(p.style) })),
      );
    }
    return out;
  } catch {
    return out;
  }
}

// ── 심볼 다건 현재가 (벌크) ──
// getLatestPrice 는 instrument_id 1건씩 왕복한다. 목록 화면(진입 대기 등)은 심볼만
// 들고 있고 건수도 여럿이라, 심볼 → 최신 종가·전일대비를 한 번에 채운다.
export async function getLatestPricesBySymbols(
  symbols: string[],
): Promise<Map<string, LatestPrice>> {
  const out = new Map<string, LatestPrice>();
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return out;
  try {
    const supabase = createPublicClient();
    const { data: insts } = await supabase
      .from("instruments")
      .select("id,symbol")
      .in("symbol", uniq);
    const symById = new Map<number, string>();
    for (const r of (insts ?? []) as { id: number; symbol: string }[]) {
      symById.set(Number(r.id), r.symbol);
    }
    const ids = [...symById.keys()];
    if (ids.length === 0) return out;

    // 종목당 최신 2봉이면 전일대비 계산에 충분 — 여유를 두고 한 번에 가져온다.
    const { data: rows } = await supabase
      .from("ohlcv")
      .select("instrument_id,ts,close")
      .eq("interval", "1d")
      .in("instrument_id", ids)
      .order("ts", { ascending: false })
      .limit(ids.length * 4);

    const byId = new Map<number, { ts: string; close: number }[]>();
    for (const b of (rows ?? []) as Record<string, number | string>[]) {
      const iid = Number(b.instrument_id);
      const arr = byId.get(iid) ?? [];
      if (arr.length < 2) arr.push({ ts: String(b.ts), close: Number(b.close) });
      byId.set(iid, arr);
    }
    for (const [iid, bars] of byId) {
      const sym = symById.get(iid);
      if (!sym || bars.length === 0) continue;
      const close = bars[0].close;
      const prevClose = bars[1]?.close ?? null;
      out.set(sym, {
        close,
        prevClose,
        // 비율(fraction) — 표시는 fmtPct 가 ×100 처리(getLatestPrice 와 동일 규약).
        changePct:
          prevClose != null && prevClose !== 0 ? (close - prevClose) / prevClose : null,
        date: bars[0].ts.slice(0, 10),
      });
    }
    return out;
  } catch {
    return out;
  }
}

// ── 알파존 종목 (그리드) ──
// 현재가가 '진입~손절 알파 존'에 들어온(=매수 실행 구간) 종목만 모아 카드 그리드로.
// zone_pos = (현재가−손절)/(진입−손절): 1.0=진입가 도달, 0=손절 임박. 음수=손절 이탈.
// 미니 차트용 일봉 (시·고·저·종)
export interface MiniBar {
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface AlphaZoneCard {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  setup: TradeSetup;
  style: TradeStyle;
  strength: number;
  entry: number;
  stop: number;
  tp1: number | null;
  tp2: number | null;
  price: number;
  changePct: number | null;
  rr: number | null;
  zonePos: number; // (price−stop)/(entry−stop)
  bars: MiniBar[]; // 미니 차트용 최근 일봉
}

const MINI_BARS = 32; // 미니 캔들 개수

// 알파 존(진입 적합) 판정: 현재가가 진입가 ±3% 이내 = '지금 진입하기 좋은 자리'.
// 손절 근처까지 밀린 종목은 진입엔 부적합하므로 제외(진입가 부근만 노출).
const ENTRY_BAND = 0.03;

function zonePosition(price: number, entry: number, stop: number): number {
  return (price - stop) / (entry - stop);
}

export async function getAlphaZoneStocks(
  limit = 12,
): Promise<Loaded<AlphaZoneCard[]>> {
  try {
    const supabase = createPublicClient();
    // 매수 시그널 + 레벨. 강도순 상위에서 종목별 최강 1건만.
    const { data: sigs, error } = await supabase
      .from("signals")
      .select(
        "instrument_id,setup,style,strength,entry_price,stop_loss,tp1,tp2,risk_reward,instruments!inner(symbol,name,exchange,currency)",
      )
      .eq("signal_type", "buy")
      .order("strength", { ascending: false })
      .limit(300);
    if (error || !sigs || sigs.length === 0) throw error ?? new Error("empty");

    // PostGREST 임베드(instruments)는 타입상 배열로 추론되나 FK(다대일)라 런타임은 단일 객체.
    type Row = Record<string, unknown> & { instruments: Record<string, unknown> };
    const best = new Map<number, Row>();
    for (const r of sigs as unknown as Row[]) {
      const iid = r.instrument_id as number;
      if (r.entry_price == null || r.stop_loss == null) continue;
      if (!best.has(iid)) best.set(iid, r);
    }
    const ids = [...best.keys()];
    if (ids.length === 0) throw new Error("no leveled signals");

    // 최근 일봉(OHLC) 일괄 조회 (종목별 그룹).
    const { data: rows } = await supabase
      .from("ohlcv")
      .select("instrument_id,ts,open,high,low,close")
      .eq("interval", "1d")
      .in("instrument_id", ids)
      .order("ts", { ascending: false })
      .limit(ids.length * (MINI_BARS + 5));
    const barsById = new Map<number, MiniBar[]>();
    for (const b of (rows ?? []) as Record<string, number | string>[]) {
      const iid = Number(b.instrument_id);
      const arr = barsById.get(iid) ?? [];
      if (arr.length < MINI_BARS) {
        arr.push({
          o: Number(b.open),
          h: Number(b.high),
          l: Number(b.low),
          c: Number(b.close),
        });
      }
      barsById.set(iid, arr);
    }

    const cards: AlphaZoneCard[] = [];
    for (const [iid, r] of best) {
      const desc = barsById.get(iid);
      if (!desc || desc.length < 2) continue;
      const bars = [...desc].reverse(); // 오름차순(과거→현재)
      const price = bars[bars.length - 1].c;
      const prev = bars[bars.length - 2].c;
      const entry = Number(r.entry_price);
      const stop = Number(r.stop_loss);
      if (entry <= stop) continue;
      // 진입 적합: 현재가가 진입가 ±3% 이내 = 지금 진입하기 좋은 자리.
      if (price < entry * (1 - ENTRY_BAND) || price > entry * (1 + ENTRY_BAND)) continue;
      const inst = r.instruments;
      cards.push({
        symbol: inst.symbol as string,
        name: inst.name as string,
        exchange: inst.exchange as string,
        currency: (inst.currency as string) ?? "KRW",
        setup: r.setup as TradeSetup,
        style: r.style as TradeStyle,
        strength: Number(r.strength),
        entry,
        stop,
        tp1: r.tp1 != null ? Number(r.tp1) : null,
        tp2: r.tp2 != null ? Number(r.tp2) : null,
        price,
        changePct: prev ? (price - prev) / prev : null,
        rr: r.risk_reward != null ? Number(r.risk_reward) : null,
        zonePos: zonePosition(price, entry, stop),
        bars,
      });
    }
    if (cards.length === 0) throw new Error("none in zone");
    // 강도 우선, 동률이면 진입가 근접(zonePos 1.0 근처) 우선.
    cards.sort(
      (a, b) =>
        b.strength - a.strength ||
        Math.abs(1 - a.zonePos) - Math.abs(1 - b.zonePos),
    );
    return { data: cards.slice(0, limit), isSample: false };
  } catch {
    return { data: sampleAlphaZoneCards(limit), isSample: true };
  }
}

// 결정적 PRNG (LCG) — 종목 심볼+인덱스 시드. 매 호출 결과 동일(SSR 재현성).
function lcg(seed: number): () => number {
  let s = seed % 0x7fffffff;
  if (s <= 0) s += 0x7fffffff - 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff; // [0,1)
  };
}

// 실제 차트처럼 보이는 일봉 OHLC — 경로(추세)로의 평균회귀 + 자연스러운 일중 노이즈·꼬리.
// 고점에서 눌려 entry 근처(존)에 도달하는 '눌림 진입' 서사. 종목별 변동성/형태 변주.
function sampleBars(
  symbol: string,
  idx: number,
  entry: number,
  endPrice: number,
): MiniBar[] {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) & 0x7fffffff;
  const rnd = lcg(h + (idx + 1) * 2654435);
  const vol = 0.012 + rnd() * 0.016; // 일 변동성 1.2~2.8%
  const startMult = 1.05 + rnd() * 0.09; // 시작가 = entry × 1.05~1.14 (고점)
  const startPrice = entry * startMult;

  const bars: MiniBar[] = [];
  let price = startPrice;
  for (let k = 0; k < MINI_BARS; k++) {
    const t = k / (MINI_BARS - 1);
    const pathTarget = startPrice + (endPrice - startPrice) * t; // 추세 경로
    const pull = (pathTarget - price) * 0.18; // 경로로의 평균회귀
    const shock = (rnd() * 2 - 1) * price * vol; // 일일 충격
    const open = price;
    const close =
      k === MINI_BARS - 1 ? endPrice : Math.max(1, Math.round(price + pull + shock));
    // 꼬리: 몸통 + 추가 변동
    const span = Math.abs(close - open) + price * vol * (0.35 + rnd() * 0.8);
    const high = Math.round(Math.max(open, close) + span * rnd() * 0.6);
    const low = Math.round(Math.min(open, close) - span * rnd() * 0.6);
    bars.push({ o: Math.round(open), h: high, l: low, c: close });
    price = close;
  }
  return bars;
}

// 샘플: SAMPLE_SIGNALS 를 '존 진입' 상태로 변형(현재가를 진입가 근처로) + 결정적 일봉(OHLC) 시퀀스.
function sampleAlphaZoneCards(limit: number): AlphaZoneCard[] {
  return SAMPLE_SIGNALS.filter(
    (s) => s.entry_price != null && s.stop_loss != null,
  )
    .slice(0, limit)
    .map((s, i) => {
      const entry = s.entry_price as number;
      const stop = s.stop_loss as number;
      // 현재가: 진입가의 0.985~1.015 사이(존 안)로 결정적 배치.
      const off = ((i % 5) - 2) * 0.006; // -1.2% ~ +1.2%
      const price = Math.round(entry * (1 + off));
      const bars = sampleBars(s.symbol, i, entry, price);
      return {
        symbol: s.symbol,
        name: s.name,
        exchange: s.exchange,
        currency: s.currency,
        setup: s.setup,
        style: s.style,
        strength: s.strength,
        entry,
        stop,
        tp1: s.tp1,
        tp2: s.tp2,
        price,
        changePct: s.change_pct ?? null,
        rr: s.risk_reward,
        zonePos: zonePosition(price, entry, stop),
        bars,
      };
    });
}

// ── 리스크 (종목 상세) ── 엔진 risk_metrics(베타·변동성·VaR·MDD) + factor_scores
//    (팩터 노출). 둘 다 없을 때만 샘플 폴백.
export async function getRisk(
  instrumentId: number,
  symbol = "",
): Promise<Loaded<RiskView>> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("risk_metrics")
      .select("date,beta,vol_annual,var_95,max_drawdown")
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
        as_of: (data.date as string | null) ?? null,
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
    score: row.score != null ? Math.round(Number(row.score) * 10) / 10 : null,
  };
}

export async function getReports(
  limit = 30,
  opts: { includeUnfit?: boolean } = {},
): Promise<Loaded<ReportListItem[]>> {
  try {
    const supabase = createPublicClient();
    let q = supabase
      .from("reports")
      .select(
        "id,report_type,title,as_of,rating,target_price,summary,model_version,score:payload->verdict->>score,instruments(symbol,name)",
      )
      .eq("status", "published")
      .eq("report_type", "indepth") // 종목 분석만 — 마켓 브리프는 /focus 카드로
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
    const supabase = createPublicClient();
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
    const supabase = createPublicClient();
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

// ── 대시보드 KPI 집계 ──
// 오늘의 픽(daily_focus) 건수 + 활성 픽 평균 수익률 + 발행 리포트 건수 + 백테스트 통과 현황
export interface DashboardKpi {
  picksToday: number;       // 오늘(최신 as_of) 픽 수
  reportsTotal: number;     // 발행 리포트 전체 건수(indepth)
  activePickReturn: number | null; // 진행중 픽 평균 수익률 (null=없음)
  backtestPassed: number;   // 통과 전략
  backtestTotal: number;    // 전체 전략
}

export async function getDashboardKpi(): Promise<DashboardKpi> {
  try {
    const supabase = createPublicClient();

    // 픽: 최신 as_of 의 daily_focus 건수
    const { data: latestFocus } = await supabase
      .from("recommendations")
      .select("as_of")
      .eq("basket_type", "daily_focus")
      .order("as_of", { ascending: false })
      .limit(1);
    const latestDate = latestFocus?.[0]?.as_of ?? null;
    let picksToday = 0;
    if (latestDate) {
      const { count } = await supabase
        .from("recommendations")
        .select("id", { count: "exact", head: true })
        .eq("basket_type", "daily_focus")
        .eq("as_of", latestDate);
      picksToday = count ?? 0;
    }

    // 리포트 건수 — 최신 발행일 기준(오늘 발행분). 누적이 아니라 일일 운영 현황.
    const { data: latestRep } = await supabase
      .from("reports")
      .select("as_of")
      .eq("status", "published")
      .eq("report_type", "indepth")
      .order("as_of", { ascending: false })
      .limit(1);
    const latestRepDate = latestRep?.[0]?.as_of ?? null;
    let reportsTotal = 0;
    if (latestRepDate) {
      const { count: reportsCount } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("report_type", "indepth")
        .eq("as_of", latestRepDate);
      reportsTotal = reportsCount ?? 0;
    }

    // 백테스트 통과 현황
    const { data: bts } = await supabase
      .from("backtests")
      .select("setup,style,passed,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const seen = new Set<string>();
    let passed = 0, total = 0;
    for (const r of (bts ?? []) as Record<string, unknown>[]) {
      const key = `${r.setup}|${r.style ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      if (r.passed === true) passed++;
    }

    return {
      picksToday,
      reportsTotal,
      activePickReturn: null, // 실시간 집계는 추후 — getPickHistory 별도 호출
      backtestPassed: passed,
      backtestTotal: total,
    };
  } catch {
    // 샘플 폴백
    return {
      picksToday: 5,
      reportsTotal: 100,
      activePickReturn: 0.032,
      backtestPassed: 7,
      backtestTotal: 10,
    };
  }
}

// ── 대시보드 마켓 스트립 ──
// 코스피·코스닥 + 매크로(원달러·VIX) 조합. 실데이터 없으면 샘플 폴백.
export interface MarketQuote {
  id: string;
  label: string;
  value: number;
  change: number;  // 절대값 변동
  changePct: number | null;  // 비율 변동(소수)
  unit: string;
  up: boolean;
  spark: number[];
  sample?: boolean;  // 이 항목만 예시값(실데이터 소스 미연결)
  asOf?: string;     // 기준일(YYYY-MM-DD) — FRED 1~2일 지연이라 표시 필수
}

function miniSpark(seed: number, up: boolean, len = 16): number[] {
  const out: number[] = [];
  let v = 100, s = seed;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    v += (s / 0x7fffffff - 0.5) * 2 + (up ? 0.3 : -0.3);
    out.push(v);
  }
  return out;
}

const SAMPLE_MARKET_QUOTES: MarketQuote[] = [
  { id: "KOSPI", label: "코스피", value: 2798.43, change: 12.31, changePct: 0.0044, unit: "", up: true, spark: miniSpark(1, true) },
  { id: "KOSDAQ", label: "코스닥", value: 842.07, change: -3.12, changePct: -0.0037, unit: "", up: false, spark: miniSpark(2, false) },
  { id: "SP500", label: "S&P 500", value: 6142.07, change: 28.4, changePct: 0.0046, unit: "", up: true, spark: miniSpark(5, true) },
  { id: "NASDAQCOM", label: "나스닥", value: 19836.55, change: -84.2, changePct: -0.0042, unit: "", up: false, spark: miniSpark(6, false) },
  { id: "VIXCLS", label: "VIX", value: 13.82, change: -0.41, changePct: -0.0288, unit: "", up: false, spark: miniSpark(4, false) },
  { id: "DEXKOUS", label: "원달러", value: 1348.5, change: -2.3, changePct: -0.0017, unit: "원", up: false, spark: miniSpark(3, false) },
  { id: "DGS10", label: "미 국채 10Y", value: 4.12, change: 0.03, changePct: 0.0073, unit: "%", up: true, spark: miniSpark(7, true) },
];

export async function getMarketQuotes(): Promise<Loaded<MarketQuote[]>> {
  // 표시 순서 고정: 국내 지수 → 미 지수 → 변동성 → 환율 → 금리
  const META: { id: string; label: string; unit: string; fallbackId?: string }[] = [
    { id: "KOSPI", label: "코스피", unit: "" },
    { id: "KOSDAQ", label: "코스닥", unit: "" },
    { id: "SP500", label: "S&P 500", unit: "" },
    { id: "NASDAQCOM", label: "나스닥", unit: "" },
    { id: "VIXCLS", label: "VIX", unit: "" },
    { id: "USDKRW", label: "원달러", unit: "원", fallbackId: "DEXKOUS" },
    { id: "DGS10", label: "미 국채 10Y", unit: "%" },
  ];
  try {
    const supabase = createPublicClient();
    // KOSPI/KOSDAQ=KIS(당일 종가) · USDKRW=네이버 환율 고시(당일, FRED DEXKOUS 폴백) ·
    // 나머지는 FRED(1~2일 지연 — 카드에 기준일 표시).
    const macroIds = ["KOSPI", "KOSDAQ", "SP500", "NASDAQCOM", "VIXCLS", "USDKRW", "DEXKOUS", "DGS10"];
    const { data: mc } = await supabase
      .from("macro")
      .select("series_id,date,value")
      .in("series_id", macroIds)
      .order("date", { ascending: true });
    if (!mc || mc.length === 0) throw new Error("no macro");

    const bySeries = new Map<string, number[]>();
    const lastDate = new Map<string, string>();
    for (const row of mc as { series_id: string; date: string; value: number }[]) {
      const arr = bySeries.get(row.series_id) ?? [];
      arr.push(Number(row.value));
      bySeries.set(row.series_id, arr);
      lastDate.set(row.series_id, row.date); // date 오름차순 조회라 마지막 값이 최신
    }
    const quotes: MarketQuote[] = [];
    for (const meta of META) {
      // 1차 시리즈 없으면 폴백 시리즈(예: USDKRW→DEXKOUS) → 그래도 없으면 예시값 표시
      const useId = bySeries.has(meta.id)
        ? meta.id
        : meta.fallbackId && bySeries.has(meta.fallbackId)
          ? meta.fallbackId
          : meta.id;
      const vals = bySeries.get(useId);
      if (!vals || vals.length === 0) {
        const s = SAMPLE_MARKET_QUOTES.find(
          (q) => q.id === meta.id || q.id === meta.fallbackId,
        );
        if (s) quotes.push({ ...s, sample: true });
        continue;
      }
      const value = vals[vals.length - 1];
      const prev = vals.length > 1 ? vals[vals.length - 2] : value;
      const change = value - prev;
      const changePct = prev !== 0 ? change / prev : null;
      quotes.push({
        id: meta.id,
        label: meta.label,
        value,
        change,
        changePct,
        unit: meta.unit,
        up: change >= 0,
        spark: vals.slice(-16),
        asOf: lastDate.get(useId),
      });
    }
    if (quotes.length === 0) throw new Error("empty");
    return { data: quotes, isSample: false };
  } catch {
    return { data: SAMPLE_MARKET_QUOTES, isSample: true };
  }
}

// ── 시그널 섹터 분포 / 스파크 (시장분석·추천종목) ──
export interface SignalSectorCount {
  sector: string;
  count: number;
}

const SAMPLE_SIGNAL_SECTORS: SignalSectorCount[] = [
  { sector: "반도체", count: 4 },
  { sector: "2차전지", count: 2 },
  { sector: "방산", count: 2 },
  { sector: "바이오", count: 1 },
  { sector: "자동차", count: 1 },
  { sector: "금융", count: 1 },
  { sector: "인터넷", count: 1 },
];

export async function getSignalSectorCounts(): Promise<Loaded<SignalSectorCount[]>> {
  try {
    const supabase = createPublicClient();
    // 오늘 날짜 기준(UTC) — 가장 최근 created_at 배치의 날짜 그룹
    const { data: latest } = await supabase
      .from("signals")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!latest) throw new Error("no signals");
    const latestDate = (latest.created_at as string).slice(0, 10);
    const { data, error } = await supabase
      .from("signals")
      .select("instruments!inner(sector)")
      .gte("created_at", `${latestDate}T00:00:00`)
      .lte("created_at", `${latestDate}T23:59:59`);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    const counts = new Map<string, number>();
    // Supabase to-one 임베드는 타입상 배열로 추론되나 런타임은 객체 — 양쪽 안전 처리
    type Inst = { sector: string | null };
    for (const row of data as unknown as { instruments: Inst | Inst[] | null }[]) {
      const inst = Array.isArray(row.instruments) ? row.instruments[0] : row.instruments;
      const s = inst?.sector ?? "기타";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const result = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sector, count]) => ({ sector, count }));
    return { data: result, isSample: false };
  } catch {
    return { data: SAMPLE_SIGNAL_SECTORS, isSample: true };
  }
}

// ── ohlcv 최근 N봉 종가 스파크 ──
// 스크리너 테이블의 12봉 미니 바에 사용
export async function getSparkForSymbol(
  symbol: string,
  bars = 12,
): Promise<number[]> {
  try {
    const supabase = createPublicClient();
    const { data: inst } = await supabase
      .from("instruments")
      .select("id")
      .eq("symbol", symbol)
      .limit(1)
      .single();
    if (!inst) return [];
    const { data, error } = await supabase
      .from("ohlcv")
      .select("close")
      .eq("instrument_id", inst.id)
      .eq("interval", "1d")
      .order("ts", { ascending: false })
      .limit(bars);
    if (error || !data || data.length === 0) return [];
    return (data as { close: number }[]).map((r) => Number(r.close)).reverse();
  } catch {
    return [];
  }
}

