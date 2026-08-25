// 기본은 공개(무쿠키·60초 캐시) 클라이언트. 쿠키를 읽으면 요청이 동적으로 확정돼
// fetch 캐시가 전부 무효화되므로, 세션이 실제로 필요한 곳에서만 createUserClient 를 쓴다.
import { createPublicClient } from "@/lib/supabase/public";
import { getSessionUser } from "@/lib/session";
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
  /** 축은 기간이다(short/mid/long). 스타일 필터는 화면에서 걷어냈다(2026-08-23). */
  horizon?: string;
  style?: string;
  setup?: string;
  session?: string;
  market?: string; // instruments.exchange — KOSPI | KOSDAQ
}

// 로그인 사용자의 트레이드당 리스크(%). 비로그인/조회 실패 시 기본값.
// (RLS: profiles 는 본인만 read → anon 은 자동으로 기본값)
export async function getUserRiskPct(): Promise<number> {
  try {
    // 여기만 로그인 세션이 필요하다 — 쿠키 클라이언트 유지(공개 캐시 대상 아님).
    // 세션 자체는 요청당 한 번만 묻는다(lib/session) — 예전엔 화면 하나에 이 왕복이
    // 다섯 번이었다(2026-08-25 측정).
    const user = await getSessionUser();
    if (!user) return DEFAULT_RISK_PER_TRADE_PCT;
    const supabase = await createUserClient();
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
    horizon: (row.horizon as string) ?? null,
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

/**
 * 지정한 종목들의 최근 공시 — 「오늘의 픽」 옆에 붙일 소식용.
 *
 * getLatestDisclosures 와 다르다. 그건 «최신 접수일 하루»를 방향별로 훑는 시장 화면용이고,
 * 이건 «이 종목들»의 최근 며칠을 종목별로 묶는다. 추천 종목이 그날 공시가 없으면 시장
 * 화면 쿼리로는 영영 안 잡힌다.
 *
 * 제목(report_nm)은 그대로 쓴다 — DART 공시는 공공기록이라 언론사 저작물과 다르다.
 * 뉴스 쪽(getNewsEvents)이 제목을 안 쓰는 것과 구분해야 한다.
 */
export async function getDisclosuresForSymbols(
  symbols: string[],
  opts: { days?: number; perSymbol?: number } = {},
): Promise<Map<string, DisclosureView[]>> {
  const out = new Map<string, DisclosureView[]>();
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return out;
  const days = opts.days ?? 30;
  const perSymbol = opts.perSymbol ?? 3;
  try {
    const supabase = createPublicClient();
    // ⚠️ rcept_dt 는 «2026-08-21» 형태다(YYYYMMDD 가 아니다). 대시를 지우고 비교하면
    //    문자열 대소가 어긋나 조용히 아무것도 안 걸린다 — 화면은 «소식 없음»으로 보인다.
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("disclosures")
      .select("id,report_nm,event_type,direction,rcept_dt,instruments!inner(symbol,name)")
      .in("instruments.symbol", uniq)
      .gte("rcept_dt", since)
      .order("rcept_dt", { ascending: false })
      .limit(uniq.length * perSymbol * 4);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const inst = (r.instruments ?? {}) as { symbol?: string; name?: string };
      const sym = inst.symbol;
      if (!sym) continue;
      const list = out.get(sym) ?? [];
      if (list.length >= perSymbol) continue;
      list.push({
        id: Number(r.id),
        symbol: sym,
        name: inst.name ?? null,
        // DART report_nm 은 공백이 잔뜩 낀 채로 온다 — 뒤에만이 아니라 **중간에도** 있다
        // (「주권매매거래정지해제              (상장폐지에 따른…)」). trim() 만 하면
        // 한 줄에 넣었을 때 제목이 끊긴 것처럼 보인다.
        reportName: String(r.report_nm ?? "").replace(/\s+/g, " ").trim(),
        eventType: (r.event_type as string) ?? null,
        direction: (r.direction as DisclosureView["direction"]) ?? null,
        receiptDate: String(r.rcept_dt),
      });
      out.set(sym, list);
    }
  } catch {
    // 조용히 빈 맵 — 소식은 부가 정보라 실패해도 페이지가 서야 한다.
  }
  return out;
}

/**
 * 특정 발행일의 「거래 부적합」 리포트 건수.
 *
 * /reports 는 부적합을 기본으로 **조회하지 않는다**(getReports 의 includeUnfit).
 * 그래서 화면에서 셀 수가 없다 — 「기본 숨김 0건」이라고 적히는데 실제로는 27건이
 * 가려져 있었다(2026-08-23). 숨기는 화면은 «몇 개를 숨겼는지»는 말해야 한다.
 * head-count 라 행을 받아오지 않는다.
 */
export async function countUnfitReports(asOf: string | null): Promise<number> {
  if (!asOf) return 0;
  try {
    const supabase = createPublicClient();
    const { count } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("as_of", asOf)
      .eq("rating", "거래 부적합");
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 「거래 부적합」으로 숨긴 종목 중 **지금 기준으로는 발행 대상**인 것이 몇인가.
 *
 * rating 은 리포트를 만든 날의 게이트로 찍힌 값이라 게이트가 (셋업 × 기간) 축으로
 * 바뀐 뒤로 어긋난다. 2026-08-23 실측 — 8/21 자 부적합 27건 중 **9건**이 지금
 * 게이트에서 발행 대상(단기·중기) 조합을 갖고 있었고, 그중 하나가 그날 실제로
 * 발행된 픽(오리온)이다. 목록이 기본으로 숨기는 것 안에 «지금 살 수 있는» 종목이
 * 섞여 있다는 뜻이다.
 *
 * 화면이 무언가를 숨긴다면 «무엇을 숨겼는지»는 말해야 한다. 그 수를 여기서 센다.
 */
export async function countUnfitButPublishable(
  asOf: string | null,
  publishHorizons: readonly string[],
): Promise<number> {
  if (!asOf) return 0;
  try {
    const supabase = createPublicClient();
    const [{ data: unfit }, { data: gate }] = await Promise.all([
      supabase
        .from("reports")
        .select("instruments!inner(symbol)")
        .eq("as_of", asOf)
        .eq("rating", "거래 부적합")
        .limit(200),
      supabase
        .from("backtests")
        .select("setup,horizon")
        .eq("passed", true)
        .not("horizon", "is", null)
        .limit(300),
    ]);
    const syms = [
      ...new Set(
        ((unfit ?? []) as { instruments?: { symbol?: string } }[])
          .map((r) => r.instruments?.symbol)
          .filter((v): v is string => !!v),
      ),
    ];
    const pub = new Set(
      ((gate ?? []) as { setup: string; horizon: string }[])
        .filter((b) => publishHorizons.includes(b.horizon))
        .map((b) => `${b.setup}|${b.horizon}`),
    );
    if (syms.length === 0 || pub.size === 0) return 0;
    const { data: sigs } = await supabase
      .from("signals")
      .select("setup,horizon,instruments!inner(symbol)")
      .in("instruments.symbol", syms)
      .limit(2000);
    const hit = new Set<string>();
    for (const r of (sigs ?? []) as {
      setup: string;
      horizon: string | null;
      instruments?: { symbol?: string };
    }[]) {
      const sym = r.instruments?.symbol;
      if (!sym || !r.horizon) continue;
      if (pub.has(`${r.setup}|${r.horizon}`)) hit.add(sym);
    }
    return hit.size;
  } catch {
    return 0;
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
/**
 * (셋업,스타일) 조합 목록에 해당하는 시그널 건수 합.
 *
 * 스크리너가 "검증 통과 N건"을 사실대로 말하기 위해 쓴다. signals 는 자연키
 * 업서트라 과거 시그널이 재발동 전까지 남고, 그사이 게이트 판정이 바뀌면
 * «테이블에 있는 조합»과 «지금 통과한 조합»이 갈린다. 표본이 아니라 DB count 로
 * 세야 한다 — 화면에 보이는 100건만 세면 전체를 오도한다.
 */
export async function countSignalsForCombos(
  combos: { setup: string; horizon?: string | null; style?: string | null }[],
): Promise<number> {
  if (combos.length === 0) return 0;
  try {
    const supabase = createPublicClient();
    const counts = await Promise.all(
      combos.map(async ({ setup, horizon, style }) => {
        // 축은 기간이다. 기간 도입 전 판정만 style 로 센다.
        let q = supabase
          .from("signals")
          .select("id", { count: "exact", head: true })
          .eq("setup", setup);
        q = horizon ? q.eq("horizon", horizon) : q.eq("style", style ?? "");
        const { count } = await q;
        return count ?? 0;
      }),
    );
    return counts.reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}

/**
 * 시그널에 **실제로 있는** 셋업과 그 건수 — 많은 순.
 *
 * 화면의 셋업 목록이 코드에 박혀 있었다(7개). 그래서 2026-08-23 실측 기준 시그널
 * 264건 중 **115건**(sortino 58 · bayes 55 · double_bottom 2)이 어떤 칩으로도 안
 * 잡히고 섹션에도 안 나왔다 — 「전체 264」인데 섹션 합이 149 였다. 그중
 * double_bottom 은 그날 발행된 픽(오리온)이 실제로 쓴 셋업이다.
 *
 * 엔진이 셋업을 늘리면 화면이 자동으로 따라와야 한다 — 목록을 DB 에서 만든다.
 * setup 컬럼만 받아 세므로(행당 십수 바이트) 조회 비용은 head-count 7번보다 작다.
 * ⚠️ PostgREST 는 한 번에 1000행까지 준다 — 총계를 먼저 세고 그만큼 페이지를 돈다.
 */
export async function getSetupCounts(): Promise<{
  total: number;
  bySetup: Map<string, number>;
}> {
  const bySetup = new Map<string, number>();
  try {
    const supabase = createPublicClient();
    const PAGE = 1000;
    const MAX_PAGES = 12; // 12,000건까지 — 그 이상은 세지 않고 있는 만큼만 쓴다
    let total = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, count } = await supabase
        .from("signals")
        .select("setup", { count: page === 0 ? "exact" : undefined })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (page === 0) total = count ?? 0;
      if (!data || data.length === 0) break;
      for (const r of data) {
        const k = String((r as { setup?: string }).setup ?? "");
        if (k) bySetup.set(k, (bySetup.get(k) ?? 0) + 1);
      }
      if (data.length < PAGE) break;
    }
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
    if (filters.horizon) q = q.eq("horizon", filters.horizon);
    if (filters.style) q = q.eq("style", filters.style);
    if (filters.setup) q = q.eq("setup", filters.setup);
    if (filters.session) q = q.eq("session", filters.session);
    if (filters.market) q = q.eq("instruments.exchange", filters.market);

    const { data, error, count } = await q;
    if (error) throw error;
    // ⚠️ «비어 있음»과 «연결 실패»를 구분한다. 예전엔 0건이면 예시 데이터로 넘어갔는데,
    // DB 가 멀쩡히 답한 0건까지 가짜 종목으로 채우는 건 위험하다 — 라벨을 붙여도
    // 사용자는 실제 신호로 읽을 수 있다. 조건에 맞는 게 없으면 없다고 말한다.
    // (2026-08-22 기간 축 전환으로 시그널을 비운 뒤 실제로 이 경로를 탔다)
    if (!data) throw new Error("no data");
    if (data.length === 0) {
      return { data: [], isSample: false, total: 0 };
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
      // maybeSingle — 0행이 «오류»가 아니다. single() 은 0행에 에러를 던져서
      // 「밸류에이션이 아직 없는 종목」과 「조회 실패」를 구분할 수 없었고, 둘 다
      // 예시 PER·PBR 로 채워졌다. 없는 건 없다고 말한다.
      .maybeSingle();
    if (error) throw error;
    if (!data) return { data: null, isSample: false };
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
      // maybeSingle — 0행과 조회 실패를 구분한다(getValuation 과 같은 이유).
      .maybeSingle();
    if (error) throw error;
    if (!data) return { data: null, isSample: false };
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
    if (error) throw error;
    // ⚠️ «비어 있음»과 «연결 실패»를 구분한다(getSignals 와 같은 규약).
    //
    // 예전에는 0건이면 예시 시그널에 **심볼만 갈아끼워** 돌려줬다. 그래서 시그널이
    // 하나도 없는 종목의 상세 화면에 그 종목 이름을 단 진입가·손절가·목표가가 떴다
    // (2026-08-23 확인: HD현대에너지솔루션·티에스이·SK 전부 해당). 「예시 데이터」
    // 배지를 달아도 사용자는 숫자를 실제 계획으로 읽는다 — 매매 레벨은 특히 그렇다.
    // DB 가 멀쩡히 답한 0건은 «없다»고 말한다.
    if (!data) throw new Error("no data");
    if (data.length === 0) return { data: [], isSample: false };
    const riskPct = await getUserRiskPct();
    return { data: data.map((r) => mapSignal(r, riskPct)), isSample: false };
  } catch {
    // 여기는 «조회 실패»만 온다 — 그때만 예시로 화면을 세운다.
    return {
      data: SAMPLE_SIGNALS.map((s) => ({ ...s, symbol })),
      isSample: true,
    };
  }
}

// FRED series_id → 표시 메타. spark 는 최근 값 시퀀스.
// ⚠️ 원달러는 USDKRW(네이버 환율 고시)다. FRED 의 DEXKOUS 는 최대 1주 지연이라
// 2026-08-22 실측에서 8일 전(8/14) 값을 «오늘»처럼 보여주고 있었다 — 그때 티커는
// 어제(8/21) 값을 쓰고 있어 한 화면에서 원달러가 1,414 원과 1,382 원으로 갈렸다.
// 티커(getMarketQuotes)가 진작 USDKRW 를 쓰고 DEXKOUS 를 폴백으로만 두고 있었는데
// 매크로 섹션만 옛 시리즈에 남아 있었다(engine/ingest/naver.py:262 주석 참조).
const MACRO_META: Record<string, { label: string; unit: string }> = {
  DGS10: { label: "미 국채 10Y", unit: "%" },
  USDKRW: { label: "원/달러", unit: "원" },
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
      .select("instrument_id,basket_type,style,weight,conviction,thesis,entry_price,target_price,tp2_price,stop_loss,as_of,setup,entry_rule,status,horizon,instruments(symbol,name)")
      // 재현(시뮬레이션) 바스켓은 «발행»이 아니다 — 추천 목록에 섞이면 안 된다.
      // 2026-08-22 실제로 섞여 홈·오늘의 픽에 계산값 20건이 추천으로 떴다.
      // 이 함수는 바스켓별 최신 as_of 행을 남기는 구조라, 새 바스켓이 생기면
      // 자동으로 딸려 들어온다. 발행 아닌 바스켓은 여기서 명시적으로 뺀다.
      .neq("basket_type", "resim_horizon")
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
        horizon: (r.horizon as string) ?? null,
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
  regime: {
    regime: string;
    score: number;
    drivers: string[];
    /** uptrend|downtrend|range — 옛 브리프에는 없다(그때는 축이 regime 하나였다). */
    market_state?: string | null;
  } | null;
  market: MarketBreadth | null;
  /** 'outage' 면 그날 배치가 안 돌았다는 기록이다(브리프가 아니다).
   *  «내용이 비었다»로 판정하면 안 된다 — 2026-08-13 이전 브리프는 시장 폭이 없을 뿐
   *  멀쩡한 글이다. 없는 것과 안 돈 것을 값으로 갈라 둔다. */
  kind: string | null;
  macro: {
    series: string;
    label: string;
    value: number;
    change_pct: number | null;
    /** 그 지표의 기준일. 지표마다 발표 주기가 달라 한 브리프 안에서도 날짜가 갈린다 —
     *  그래서 반드시 적는다(2026-08-22: 4일 전 유가가 «오늘 값»처럼 보였다). */
    date?: string | null;
  }[];
  created_at: string;
}

// 3국면 시장 상태 — market_regime 최신행 직접 읽기(모닝브리프 payload 와 별개).
// market_state 미상(구버전 레짐)이면 regime 으로 폴백 추론.
// 2026-08-22: «전환» 국면과 structure(ER) 컬럼을 뺐다 — 엔진에서 축이 제거됐고,
// 그 값을 가진 행은 애초에 하나도 없었다(engine/market/regime 참조).
export interface MarketStateView {
  regime: string;
  score: number;
  market_state: string | null; // uptrend|downtrend|range
  drivers: string[];
}

export async function getMarketState(): Promise<MarketStateView | null> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("market_regime")
      .select("regime,score,drivers,market_state")
      .order("date", { ascending: false })
      .limit(1)
      .single();
    if (!data) return null;
    const regime = (data.regime as string) ?? "neutral";
    // 폴백 — market_state 없으면 regime 으로 추론(상승/하락/중립).
    const fallback =
      regime === "risk_off" ? "downtrend" : regime === "risk_on" ? "uptrend" : "range";
    return {
      regime,
      score: Number(data.score ?? 0),
      market_state: (data.market_state as string) ?? fallback,
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

/** asOf 다음 N번째 거래일. 휴장일 표가 그 구간을 못 덮으면 null(단정하지 않는다).
 *
 * 픽 카드의 «청산 기한»에 쓴다 — 기간(중기 10거래일)이 끝나면 그날 종가에 전량
 * 정리한다는 규칙이 화면 어디에도 없었다(2026-08-22). 진입일부터 세므로 호출부는
 * 진입일(= 발행일 다음 거래일)을 넘긴다.
 *
 * getNextTradingDay 를 N번 부르면 왕복이 N회다. 여기서는 휴장일을 한 번만 읽고
 * 메모리에서 센다.
 */
export async function getNthTradingDay(
  asOf: string,
  n: number,
): Promise<string | null> {
  if (n <= 0) return null;
  try {
    const supabase = createPublicClient();
    // 10거래일이면 최장 3주 남짓이지만, 연휴가 겹칠 수 있어 넉넉히 본다.
    const to = new Date(Date.parse(asOf + "T00:00:00Z") + (n * 3 + 30) * 864e5)
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
      .limit(200);

    const holidays = new Set(((data ?? []) as { date: string }[]).map((r) => String(r.date)));
    const d = new Date(Date.parse(asOf + "T00:00:00Z"));
    let seen = 0;
    for (let i = 0; i < n * 3 + 30; i++) {
      d.setUTCDate(d.getUTCDate() + 1);
      const iso = d.toISOString().slice(0, 10);
      // 확정 기한 너머는 답하지 않는다 — 그 뒤 휴장은 표에 없을 뿐 없는 게 아니다.
      if (iso > confirmedThrough) return null;
      const wd = d.getUTCDay();
      if (wd === 0 || wd === 6 || holidays.has(iso)) continue;
      if (++seen === n) return iso;
    }
    return null;
  } catch {
    return null;
  }
}

/** 거래일 계산기 — 휴장일을 **한 번만** 읽고 메모리에서 센다.
 *
 * getNthTradingDay 는 부를 때마다 market_calendar 를 두 번 조회한다. 보유 픽이 여러 건
 * 이고 발행일이 제각각이면 그만큼 왕복이 는다(픽 10건이면 20회). 화면 하나가 쓰는
 * 거래일 계산은 같은 휴장일 표를 보므로 한 번 읽어 함수로 넘긴다.
 *
 * confirmed 가 false 면 nth() 는 항상 null 이다 — 휴장 목록이 그 구간을 못 덮으면
 * 날짜를 단정하지 않는다(틀린 날짜보다 「N거래일째」가 정직하다).
 */
export interface TopNewsItem {
  id: number;
  headline: string;
  source: string;
  url: string | null;
  publishedAt: string;
  /** 제목에서 잡힌 시장 키워드 — 왜 «시장 뉴스»로 골랐는지의 근거. */
  topics: string[];
  /** 이 기사가 걸려 있는 종목 수 — 여럿이면 개별 기업이 아니라 시황 기사다. */
  breadth: number;
}

/** 증시 전체에 영향을 주는 «시장 키워드». 제목에 있으면 시황 기사로 본다. */
const MARKET_KEYWORDS = [
  "코스피", "코스닥", "증시", "환율", "금리", "국채", "연준", "Fed", "FOMC",
  "금통위", "한은", "기준금리", "외국인", "기관", "수급", "물가", "인플레",
  "CPI", "유가", "달러", "나스닥", "다우", "S&P", "뉴욕증시", "무역", "관세",
  "경기", "공매도", "지수",
];

/** 개별 종목·정형 기사 — 시장 뉴스가 아니다. */
const NOT_MARKET = [/^\[?특징주/, /^기업 공시/, /^\[?표\s?\]/, /^\[포토/, /^\[사진/];

/** 오늘 주요 뉴스 — «증시 전체를 움직이는» 기사만.
 *
 * 2026-08-23 Victor: "오늘 주요 뉴스는 증시에 영향을 미치는 그런 뉴스를 이야기하는
 * 것인데, 금리 변동이라든지". 첫 판은 종목별 기업 뉴스(신약 개발·수주)를 뽑아 그
 * 요구와 어긋났다.
 *
 * 시황 기사를 골라내는 신호 둘을 쓴다:
 *   ① 여러 종목에 동시에 걸려 있다 — 네이버는 «종목별 뉴스» 페이지에 시황 기사를 같이
 *      올리므로, 한 기사가 여러 종목에 붙어 있으면 그건 개별 기업 기사가 아니다.
 *   ② 제목에 시장 키워드가 있다 — 코스피·금리·환율·외국인 …
 * 점수 = (걸린 종목 수 − 1) + 키워드 수 × 2. 키워드를 두 배로 치는 건 ①만으로는
 * 항공 3사 M&A 같은 «산업» 뉴스가 올라오기 때문이다(실측).
 *
 * ⚠️ 뉴스는 매수 신호가 아니다(PEAD 실측 -0.02). «무엇이 시장을 움직였나»를 보는
 * 자리이지 «무엇을 사라»가 아니다.
 */
export async function getTopNews(limit = 6, days = 2): Promise<TopNewsItem[]> {
  try {
    const supabase = createPublicClient();
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const { data } = await supabase
      .from("news")
      .select("id,instrument_id,headline,source,url,published_at,provider_article_id")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(800);
    const rows = (data ?? []) as {
      id: number;
      instrument_id: number | null;
      headline: string;
      source: string;
      url: string | null;
      published_at: string;
      provider_article_id: string | null;
    }[];
    if (rows.length === 0) return [];

    // 같은 기사가 종목마다 한 행씩 들어온다 — 기사 단위로 접으면서 걸린 종목 수를 센다.
    type Bucket = {
      rep: (typeof rows)[number];
      insts: Set<number>;
    };
    const byArticle = new Map<string, Bucket>();
    for (const r of rows) {
      const key = r.provider_article_id ?? r.headline.replace(/\s/g, "");
      const b = byArticle.get(key);
      if (b) {
        if (r.instrument_id != null) b.insts.add(r.instrument_id);
      } else {
        byArticle.set(key, {
          rep: r,
          insts: new Set(r.instrument_id != null ? [r.instrument_id] : []),
        });
      }
    }

    return [...byArticle.values()]
      .map(({ rep, insts }) => {
        const topics = MARKET_KEYWORDS.filter((k) => rep.headline.includes(k));
        const excluded = NOT_MARKET.some((re) => re.test(rep.headline));
        return {
          id: rep.id,
          headline: rep.headline,
          source: rep.source,
          url: rep.url,
          publishedAt: rep.published_at,
          topics,
          breadth: insts.size,
          score: excluded ? -99 : Math.max(0, insts.size - 1) + topics.length * 2,
        };
      })
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, limit)
      .map(({ score: _score, ...item }) => item);
  } catch {
    return [];
  }
}

export interface ExpertNote {
  id: number;
  expertName: string;
  expertHeadline: string | null;
  avatarUrl: string | null;
  symbol: string | null;
  name: string | null;
  asOf: string;
  stance: "buy" | "watch";
  summary: string;
  body: string | null;
  tags: string[];
  /** 가격 레벨 — «산다»면 진입가·손절가가 반드시 있다(0041 의 check 제약).
   *  목표가는 선택이다. 레벨이 없으면 읽는 사람이 실행할 수 없고, 손절 없이 산다. */
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  /** 며칠 | 몇 주 | 몇 달 — 엔진의 단기·중기·장기(5·10·20일)와 다른 축이다. */
  horizonNote: string | null;
}

/** 전문가 추천 — 사람이 고른 종목. **추적하지 않는다**.
 *
 * 2026-08-23 Victor: "전문가 픽은 추적할 필요 없어. 이것은 시스템이 아니라 여러
 * 전문가들이 참여해서 추천해준다는 거지."
 *
 * ⚠️ 「오늘의 픽」과 다른 물건이다. 저건 게이트를 통과한 실행 계획(진입가·손절가·기간)
 * 이고 엔진이 매일 상태를 갱신한다. 이건 의견이라 상태도 수익률도 없다 — 그래서
 * 화면에서 모양을 다르게 그려야 한다(표가 아니라 카드). 같은 모양으로 그리면
 * 사용자가 «이것도 검증된 것»으로 읽고, 손절 없이 산 뒤 당황한다.
 */
export interface ExpertNotesLoad {
  notes: ExpertNote[];
  /** true 면 «아직 글이 없다»가 아니라 «읽어 오지 못했다».
   *
   *  두 말을 섞지 않는다(2026-08-23 원칙). 실제로 0040 마이그레이션이 운영 DB 에
   *  적용되지 않아 expert_notes 표 자체가 없던 동안, 화면은 태연히 "아직 올라온
   *  추천이 없습니다"라고 말했다. 코너가 준비 중인 것과 우리가 못 읽는 것은 다르다. */
  failed: boolean;
}

export async function getExpertNotes(limit = 6): Promise<ExpertNotesLoad> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("expert_notes")
      .select(
        "id,as_of,stance,summary,body,tags,entry_price,target_price,stop_loss,horizon_note,experts(name,headline,avatar_url,active),instruments(symbol,name)",
      )
      .eq("published", true)
      .order("as_of", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit * 2);
    if (error) throw error;
    const rows = (data ?? []) as unknown as {
      id: number;
      as_of: string;
      stance: string;
      summary: string;
      body: string | null;
      tags: string[] | null;
      entry_price: number | null;
      target_price: number | null;
      stop_loss: number | null;
      horizon_note: string | null;
      experts: { name: string; headline: string | null; avatar_url: string | null; active: boolean } | null;
      instruments: { symbol: string; name: string } | null;
    }[];
    const notes = rows
      .filter((r) => r.experts?.active !== false)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        expertName: r.experts?.name ?? "—",
        expertHeadline: r.experts?.headline ?? null,
        avatarUrl: r.experts?.avatar_url ?? null,
        symbol: r.instruments?.symbol ?? null,
        name: r.instruments?.name ?? null,
        asOf: r.as_of,
        stance: (r.stance === "buy" ? "buy" : "watch") as ExpertNote["stance"],
        summary: r.summary,
        body: r.body ?? null,
        tags: r.tags ?? [],
        entry_price: r.entry_price,
        target_price: r.target_price,
        stop_loss: r.stop_loss,
        horizon_note: r.horizon_note,
      }))
      .map(({ entry_price, target_price, stop_loss, horizon_note, ...rest }) => ({
        ...rest,
        entryPrice: entry_price == null ? null : Number(entry_price),
        targetPrice: target_price == null ? null : Number(target_price),
        stopLoss: stop_loss == null ? null : Number(stop_loss),
        horizonNote: horizon_note,
      }));
    return { notes, failed: false };
  } catch {
    // 표가 없거나(0040 미적용) 조회가 실패한 경우 — «글이 없다»고 말하지 않는다.
    return { notes: [], failed: true };
  }
}

export async function getTradingCalendar(): Promise<{
  confirmedThrough: string | null;
  nth: (from: string, n: number) => string | null;
}> {
  const none = { confirmedThrough: null, nth: () => null };
  try {
    const supabase = createPublicClient();
    const { data: marker } = await supabase
      .from("market_calendar")
      .select("date")
      .eq("event_key", "holiday-coverage")
      .limit(1);
    const confirmedThrough = marker?.[0]?.date ? String(marker[0].date) : null;
    if (!confirmedThrough) return none;

    const { data } = await supabase
      .from("market_calendar")
      .select("date")
      .eq("kind", "holiday")
      .lte("date", confirmedThrough)
      .limit(2000);
    const holidays = new Set(
      ((data ?? []) as { date: string }[]).map((r) => String(r.date)),
    );

    return {
      confirmedThrough,
      nth(from: string, n: number): string | null {
        if (n <= 0 || from > confirmedThrough) return null;
        const d = new Date(Date.parse(from + "T00:00:00Z"));
        let seen = 0;
        // n 거래일이면 최장 n*2+30 일 안에 반드시 나온다(연휴를 넉넉히 잡아도).
        for (let i = 0; i < n * 2 + 30; i++) {
          d.setUTCDate(d.getUTCDate() + 1);
          const iso = d.toISOString().slice(0, 10);
          if (iso > confirmedThrough) return null;
          const wd = d.getUTCDay();
          if (wd === 0 || wd === 6 || holidays.has(iso)) continue;
          if (++seen === n) return iso;
        }
        return null;
      },
    };
  } catch {
    return none;
  }
}

/** reports 한 행 → 모닝 브리프. 최신 1건(홈·시장)과 아카이브 상세가 같은 해석을 쓴다. */
function mapMorningBrief(row: Record<string, unknown>): MorningBrief {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const n = (p.narrative ?? {}) as Record<string, unknown>;
  return {
    as_of: row.as_of as string,
    headline: (n.headline as string) ?? (row.summary as string) ?? "",
    market_view: (n.market_view as string) ?? "",
    watchpoints: (n.watchpoints as string[]) ?? [],
    regime: (p.regime as MorningBrief["regime"]) ?? null,
    market: (p.market as MarketBreadth) ?? null,
    kind: (p.kind as string) ?? null,
    macro: (p.macro as MorningBrief["macro"]) ?? [],
    created_at: (row.created_at as string) ?? "",
  };
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
    return { data: mapMorningBrief(data[0] as Record<string, unknown>), isSample: false };
  } catch {
    return { data: null, isSample: false };
  }
}

// ── 모닝 브리프 아카이브 ──
// 브리프는 2026-06-10 부터 매 거래일 한 편씩 쌓이는데, 로더가 최신 1건만 읽어
// **어제 것조차 다시 읽을 데가 없었다**(2026-08-24 확인 — DB 48건, 화면 1건).
// 인사이트에 목록을 세우고 하루치를 그대로 읽게 한다. 그동안 payload 에만 있고
// 어디에도 그리지 않던 market_view·watchpoints 가 여기서 처음 화면에 나온다.
export interface MorningBriefListItem {
  as_of: string;
  headline: string;
  /** 그날 전 종목 동일가중 수익률 — 목록 우측 숫자(주간 브리핑 행과 같은 자리). */
  market_ret: number | null;
  /** 그 브리프가 쓴 시장 데이터의 기준일. 장 시작 전에 쓰는 글이라 월요일 브리프는
   *  금요일 마감을 담는다 — 그러면 목록에 같은 장이 두 번 서므로 날짜를 적어 가른다. */
  market_as_of: string | null;
  /** 그날의 국면(uptrend|downtrend|range). 옛 브리프는 market_state 가 없어 regime 으로
   *  되돌려 읽는다 — 국면 이름은 RegimeHeader 한 곳에서만 정의한다. */
  market_state: string | null;
  /** 'outage' 면 브리프가 아니라 «그날 배치가 안 돌았다»는 기록이다. 지우지 않는다 —
   *  공백을 감추면 나중에 그 날을 «분석했는데 결과가 없던 날»로 오해한다. */
  kind: string | null;
}

export async function getMorningBriefs(limit = 60): Promise<MorningBriefListItem[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("reports")
      // payload 통째로 받으면 한 행이 3KB 다(60행 = 180KB). 목록에 쓰는 네 값만 뽑는다.
      .select(
        "id,as_of,summary,headline:payload->narrative->>headline,market_ret:payload->market->>market_ret,market_as_of:payload->market->>as_of,state:payload->regime->>market_state,regime:payload->regime->>regime,kind:payload->>kind",
      )
      .eq("report_type", "market")
      .eq("status", "published")
      .order("as_of", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit * 2);
    if (error || !data) throw error ?? new Error("none");
    const out: MorningBriefListItem[] = [];
    const seen = new Set<string>();
    for (const r of data as Record<string, unknown>[]) {
      const asOf = r.as_of as string;
      // 같은 날 두 번 발행된 적이 있다(배치 재실행). id 큰 것이 최신이라 먼저 온 게 이긴다.
      if (seen.has(asOf)) continue;
      seen.add(asOf);
      const ret = r.market_ret == null ? NaN : Number(r.market_ret);
      out.push({
        as_of: asOf,
        headline: (r.headline as string) ?? (r.summary as string) ?? "",
        market_ret: Number.isNaN(ret) ? null : ret,
        market_as_of: (r.market_as_of as string) ?? null,
        market_state:
          (r.state as string) ??
          (r.regime === "risk_on" ? "uptrend" : r.regime === "risk_off" ? "downtrend" : r.regime ? "range" : null),
        kind: (r.kind as string) ?? null,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** 하루치 브리프 — 아카이브 상세. 그날 배치가 안 돌았으면 없다(null). */
export async function getMorningBriefByDate(asOf: string): Promise<MorningBrief | null> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("reports")
      .select("as_of,summary,payload,created_at")
      .eq("report_type", "market")
      .eq("status", "published")
      .eq("as_of", asOf)
      .order("id", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) throw error ?? new Error("none");
    return mapMorningBrief(data[0] as Record<string, unknown>);
  } catch {
    return null;
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

/**
 * 사람 글 + 엔진 글을 한 섹션에 세운다 — **사람 글이 먼저**다.
 *
 * 2026-08-24 부터 엔진이 매 배치 끝에 글을 발행한다(engine/daily · engine/weekly ·
 * engine/analysis). 블로그의 원칙은 «결론은 사람이 낸다»이므로, 같은 주제에 사람 글이
 * 있으면 그것이 위에 선다. 기계 글은 그 아래를 채운다 — 자리를 비워 두지 않되
 * 사람 글을 밀어내지도 않는다.
 */
export function pickBlogPostsWithEngine(
  posts: BlogPost[],
  humanCategory: string,
  humanSub: string,
  engineSub: string,
  limit = 20,
): BlogPost[] {
  const human = pickBlogPosts(posts, humanCategory, humanSub, limit);
  const engine = pickBlogPosts(posts, "engine", engineSub, limit);
  return [...human, ...engine].slice(0, limit);
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
  /** 보유기간(short/mid/long) — 성과를 (전략 × 기간)으로 나누는 축. 옛 픽은 null. */
  horizon: string | null;
  setup: string | null;
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
    // 2026-08-22 규칙 교체(진입·축·청산 전면 변경)로 정리한 픽. «만료»로 적으면
    // 거짓이다 — 기간이 다 돼서 나온 게 아니라 우리가 규칙을 바꿔서 닫았다.
    // 실제로 사고팔았으므로 손익은 성적에 그대로 들어간다(거래 아님 목록에 넣지 않는다).
    | "규칙 교체 정리"
    // 본전 도달가에 닿아 손절이 본전으로 올라간 뒤, 되돌아와 그 자리에서 나간 픽.
    // 손절이 아니라 무승부다(수익률 ~0%) — «손절»로 적으면 진 것처럼 읽힌다.
    | "본전 청산"
    | "—";
  closed: boolean; // 엔진이 확정 기록한 픽인지(0017) — 표시 구분용
  closed_at?: string | null; // 청산일 — 포지션 합산(보유 창) 판정용
  reselects?: number; // 같은 포지션이 여러 날 재선정된 횟수(>1이면 '연속 선정' 표시)
}

const PICK_STATUS_LABELS: Record<string, PickRecord["status"]> = {
  target: "목표 도달",
  stopped: "손절",
  expired: "만료",
  partial: "1차 익절", // 분할익절 후 본전 청산(0022) — 옛 규칙(target_action="sell") 픽만
  // 채택 규칙(trail)에서 목표에 닿아 본전스톱으로 전환된 뒤 되돌아온 픽.
  // 거래는 거래다 — 승률의 분모에 들어간다(분자에는 안 들어간다, 수익률 0%).
  breakeven: "본전 청산",
  // 진입가에 끝내 닿지 않아 «살 수가 없었던» 픽(2026-08-20). 거래가 없었으므로
  // 손익도 없다 — 승률 계산에서 분모·분자 어디에도 넣지 않는다.
  unfilled: "미체결",
  // 진입을 «다음 거래일 시가»로 바꾼 뒤(2026-08-21) 생긴 두 상태.
  // pending 은 «아직 안 산» 계획이다 — 확정 기록이 아니므로 승률·수익률 집계에서
  // 빼야 한다. voided 는 갭으로 손절폭이 최소치 아래가 돼 사지 않은 것(거래 없음).
  pending: "진입 대기",
  voided: "취소",
  retired: "규칙 교체 정리",
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
  // 카드가 「오늘의 픽」과 같은 머리줄(기간 칩·셋업 칩)을 그리려면 필요하다.
  horizon: string | null;
  setup: string | null;
};

export async function getOpenPicks(limit = 30): Promise<OpenPick[]> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("recommendations")
      .select(
        "as_of,entry_price,target_price,tp2_price,stop_loss,tp1_hit,horizon,setup,instruments(symbol,name)",
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
        // 채택 규칙(target_action="trail")에서 tp1_hit 은 «1차 익절»이 아니라
        // **본전스톱으로 전환됨**을 뜻한다(2026-08-22). 그래서 바뀌는 건 목표가 아니라
        // 손절이다 — 예전 코드는 정반대로 «목표를 tp2 로 바꾸고 손절은 그대로»였고,
        // 그건 옛 스케일아웃(0022) 전제였다. tp2 는 trail 경로가 아예 안 쓴다.
        target: (r.target_price as number) ?? null,
        stop: ((r.tp1_hit ? (r.entry_price as number) : (r.stop_loss as number)) ??
          null) as number | null,
        tp1Hit: Boolean(r.tp1_hit),
        horizon: (r.horizon as string) ?? null,
        setup: (r.setup as string) ?? null,
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

// ── 재현(시뮬레이션) 성과 — basket_type='resim_horizon' ────────────────────
//
// 2026-08-22 규칙 교체(지정가 진입 → 시가 진입 · 스타일 축 → 기간 축 · 목표를
// 본전스톱 트리거로) 이전에 발행된 픽 43건을, 실제 과거 시세로 «새 규칙이었다면
// 어땠을지» 다시 계산한 것이다(apps/engine/scripts/resim_picks_horizon.py).
// 픽 1건이 기간 3벌로 펼쳐져 129행이다.
//
// ⚠️ 발행 기록이 아니다. 화면에서 반드시 «재현»으로 표기한다 — 실제로 내보낸 픽은
//    daily_focus 뿐이고, 129개 조합 중 현 게이트를 통과하는 건 2개뿐이다.
//    게이트 통과 여부는 conviction(1=통과, 0=미통과)에 실려 있다.
export interface ResimHorizonStat {
  horizon: string;
  total: number;
  // ⚠️ open 과 pending 을 **합치지 않는다**(2026-08-25). 예전엔 둘을 open 한 칸에
  // 더해 화면이 「진행중」이라 찍었는데, 진입 대기는 «아직 사지 않은» 계획이다
  // (다음 거래일 시가 진입). 그래서 /focus 「보유 중」(open 만)·같은 화면 상단
  // 「진행 중」 타일과 숫자가 어긋났다 — 단기가 4+2 라 「진행중 6」으로 보였다.
  open: number;      // 보유 중 (status=open)
  pending: number;   // 진입 대기 (status=pending) — 아직 거래가 아니다
  closed: number;
  wins: number;
  mean: number | null;
  gatePassed: number;
}

export async function getResimHorizonStats(): Promise<Loaded<ResimHorizonStat[]>> {
  const empty = { data: [] as ResimHorizonStat[], isSample: false };
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("recommendations")
      .select(
        "horizon,status,close_return_pct,conviction,as_of,closed_at,instruments(symbol)",
      )
      .eq("basket_type", "resim_horizon")
      .limit(1000);
    if (error || !data || data.length === 0) return empty;

    // ⚠️ 발행 기록(getPickHistory)과 **같은 방식으로 중복을 제거**해야 한다.
    // 그쪽은 «보유 중 재선정»을 한 포지션으로 합친다(43픽 → 35포지션). 재현만
    // 픽 단위로 세면 같은 화면에 분모가 다른 두 숫자가 뜬다 — 비교가 거짓말이 된다.
    // 기간이 다르면 다른 거래이므로 (종목 × 기간)으로 묶는다.
    interface Row {
      horizon: string;
      symbol: string;
      as_of: string;
      closed_at: string | null;
      status: string;
      ret: number | null;
      gate: boolean;
    }
    const rows: Row[] = (data as Record<string, unknown>[])
      .map((r) => ({
        horizon: (r.horizon as string) ?? "",
        symbol:
          ((r.instruments ?? {}) as Record<string, unknown>).symbol as string ?? "",
        as_of: (r.as_of as string) ?? "",
        closed_at: (r.closed_at as string) ?? null,
        status: (r.status as string) ?? "open",
        ret: (r.close_return_pct as number) ?? null,
        gate: Number(r.conviction ?? 0) >= 1,
      }))
      .filter((r) => r.horizon);

    const byKey = new Map<string, Row[]>();
    for (const r of rows) {
      const k = `${r.horizon}|${r.symbol}`;
      const arr = byKey.get(k);
      if (arr) arr.push(r);
      else byKey.set(k, [r]);
    }
    const positions: Row[] = [];
    for (const group of byKey.values()) {
      group.sort((a, b) => a.as_of.localeCompare(b.as_of));
      let cur: Row | null = null;
      for (const r of group) {
        const within = cur != null && (cur.closed_at == null || r.as_of <= cur.closed_at);
        if (!within) {
          cur = r;
          positions.push(cur);
        }
      }
    }

    const byHz = new Map<string, ResimHorizonStat>();
    const retCount = new Map<string, number>();
    for (const r of positions) {
      const cur =
        byHz.get(r.horizon) ??
        {
          horizon: r.horizon,
          total: 0,
          open: 0,
          pending: 0,
          closed: 0,
          wins: 0,
          mean: null as number | null,
          gatePassed: 0,
        };
      cur.total += 1;
      if (r.gate) cur.gatePassed += 1;
      if (r.status === "pending") {
        cur.pending += 1;
      } else if (r.status === "open") {
        cur.open += 1;
      } else {
        cur.closed += 1;
        if (r.ret != null) {
          if (r.ret > 0) cur.wins += 1;
          cur.mean = (cur.mean ?? 0) + r.ret;
          retCount.set(r.horizon, (retCount.get(r.horizon) ?? 0) + 1);
        }
      }
      byHz.set(r.horizon, cur);
    }
    for (const [hz, st] of byHz) {
      const n = retCount.get(hz) ?? 0;
      st.mean = n > 0 && st.mean != null ? st.mean / n : null;
    }
    return { data: [...byHz.values()], isSample: false };
  } catch {
    return empty;
  }
}

export async function getPickHistory(limit = 60): Promise<Loaded<PickRecord[]>> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("recommendations")
      .select(
        "as_of,entry_price,target_price,tp2_price,stop_loss,tp1_hit,instrument_id,status,closed_at,exit_price,close_return_pct,horizon,setup,instruments(symbol,name)",
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
          horizon: (r.horizon as string) ?? null,
          setup: (r.setup as string) ?? null,
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
        "setup,style,horizon,ic,sharpe,mdd,turnover,win_rate,avg_rr,expectancy_r,passed,period,params,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data || data.length === 0) throw error ?? new Error("empty");
    // 셋업별 최신 런만 — 백테스트는 재실행마다 행이 쌓이므로(이력 보존),
    // 화면에는 현행 판정 하나만. 과거 런 혼재는 모순된 PASS/FAIL 로 보임.
    const seen = new Set<string>();
    const latest = (data as Record<string, unknown>[]).filter((r) => {
      // 축이 기간으로 바뀌었다 — 같은 셋업의 기간별 판정이 서로 덮어쓰지 않게
      // 축 값을 키에 넣는다.
      const key = `${r.setup}|${r.horizon ?? r.style ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const rows: BacktestView[] = latest.map((r: Record<string, unknown>) => ({
      setup: r.setup as BacktestView["setup"],
      style: r.style as BacktestView["style"],
      horizon: (r.horizon as string) ?? null,
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
    if (error) throw error;
    if (!data) throw new Error("no data");
    // 0건 = «이 종목은 수급 데이터가 없다». 가짜로 채우지 않는다.
    if (data.length === 0) return { data: [], isSample: false };
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
  /** 축은 기간이다 — 화면은 스타일 이름(스윙·포지션)을 쓰지 않는다(2026-08-23). */
  horizon: string | null;
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
        "instrument_id,setup,style,horizon,strength,entry_price,stop_loss,tp1,tp2,risk_reward,instruments!inner(symbol,name,exchange,currency)",
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
        horizon: (r.horizon as string | null) ?? null,
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
        horizon: s.horizon ?? null,
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
    exchange: (inst.exchange as string) ?? null,
    title: row.title as string,
    as_of: row.as_of as string,
    rating: row.rating as string | null,
    target_price: row.target_price as number | null,
    summary: row.summary as string | null,
    model_version: row.model_version as string | null,
    score: row.score != null ? Math.round(Number(row.score) * 10) / 10 : null,
  };
}

// 분석 기준일 — «엔진이 마지막으로 종목을 분석한 날». 화면들이 «오늘»을 정하는 단일 기준이다.
//
// 2026-08-24 사고: 홈이 이 값을 모닝 브리프의 as_of 에서 가져왔는데, 모닝 배치는 평일
// 08:30 에 돌면서 브리프에 «오늘 날짜»를 찍는다(engine/reports/morning.py). 그 시각엔
// 그날 봉도 그날 픽도 없다 — 내용은 전 거래일 종가 이야기인데 라벨만 오늘이다. 홈은 그
// 날짜로 픽을 걸러 «발행 없음»을 띄웠고, 같은 픽을 「오늘의 픽」 화면은 정상 표시했다.
// 두 화면이 매 평일 08:30~19:40 내내 다른 말을 했다.
//
// 그래서 기준은 «브리프가 언제 쓰였나»가 아니라 «분석이 어느 날짜까지 됐나»여야 한다.
// 리포트 발행일이 그 값이고, 「오늘의 픽」(/focus)이 이미 이걸 쓴다. 거래 부적합 리포트도
// «그날 분석했다»는 증거이므로 포함한다(목록에서만 뺀다).
export async function getLatestReportDay(): Promise<string | null> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("reports")
      .select("as_of")
      .eq("status", "published")
      .eq("report_type", "indepth")
      .order("as_of", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return (data[0] as Record<string, unknown>).as_of as string;
  } catch {
    return null;
  }
}

export async function getReports(
  limit = 30,
  opts: { includeUnfit?: boolean; day?: string | null } = {},
): Promise<Loaded<ReportListItem[]>> {
  try {
    const supabase = createPublicClient();
    let q = supabase
      .from("reports")
      .select(
        "id,report_type,title,as_of,rating,target_price,summary,model_version,score:payload->verdict->>score,instruments(symbol,name,exchange)",
      )
      .eq("status", "published")
      .eq("report_type", "indepth") // 종목 분석만 — 마켓 브리프는 /focus 카드로
      .order("as_of", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    // 하루치만 — 「분석」 화면이 쓴다. 날짜가 곧 페이지다(2026-08-25).
    // 이걸 안 주면 한도(limit)만큼 여러 날이 섞여 오고, 마지막 날짜 그룹은 중간에
    // 잘린 채로 온다. «100건 중 37건»을 그날 전부인 양 보여주게 된다.
    if (opts.day) q = q.eq("as_of", opts.day);
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



// ── 발행일 목록 ──
/**
 * 리포트가 나온 날들과 그날의 건수 — 「분석」 화면의 날짜 이동이 쓴다(2026-08-25).
 *
 * 왜 필요한가: 그 화면은 한 번에 400건을 긁어 3일치를 한 장에 쌓고 있었다. 실제로는
 * **42개 발행일 × 하루 100건**이라, 나머지 39일은 화면에서 갈 길이 없었다 — 쌓여 있는데
 * 못 읽는다는 점에서 매일 브리프가 겪은 것과 같은 문제다.
 *
 * 날짜가 곧 페이지다. 하루치만 보여주고 이전/다음으로 넘긴다. 그러면 목록 길이가
 * 발행일 수와 무관하게 일정하고, 판정·시장 칩의 숫자가 **화면에 보이는 것과 정확히
 * 일치한다**(예전에는 칩은 최신일 기준인데 목록은 3일치라 서로 어긋났다).
 *
 * DB 함수를 쓰는 이유(0048): PostgREST 에 distinct 가 없어 날짜만 받아 접으려면
 * 4,200 행을 받아야 하는데 이 프로젝트의 REST 응답은 **1000행에서 잘린다**. 그러면
 * 최근 10일만 나오고 나머지는 다시 «없는 것»이 된다.
 */
export interface ReportDay {
  asOf: string;
  /** 그날 발행 건수 — 거래 부적합 포함(그날 분석을 돌렸다는 증거다) */
  count: number;
}

export async function getReportDays(limit = 120): Promise<ReportDay[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("report_days", { p_limit: limit });
    if (error || !data) throw error ?? new Error("empty");
    return (data as { as_of: string; n: number }[]).map((r) => ({
      asOf: String(r.as_of),
      count: Number(r.n),
    }));
  } catch {
    return [];
  }
}
