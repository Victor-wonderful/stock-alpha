// 예시(샘플) 데이터 — DB 미연결/빈 상태에서 화면 구조·밀도를 보여주기 위함.
// 실데이터가 들어오면 자동 대체. UI 는 isSample=true 일 때 "예시" 배지를 노출.
import type {
  BacktestView,
  FactorView,
  FlowRowView,
  InstrumentView,
  MacroSeriesView,
  RecommendationView,
  RegimeView,
  RiskView,
  SectorRotationView,
  SignalView,
  ValuationView,
} from "./types";

function spark(seed: number, up: boolean): number[] {
  const out: number[] = [];
  let v = 100;
  let s = seed;
  for (let i = 0; i < 24; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const r = s / 0x7fffffff - 0.5;
    v += r * 4 + (up ? 0.5 : -0.5);
    out.push(v);
  }
  return out;
}

type Seed = Omit<SignalView, "id" | "created_at" | "spark"> & { seedUp: boolean; seed: number };

const SEED: Seed[] = [
  mk("005930", "삼성전자", "swing", "oversold_bounce", "regular", 0.72, 71000, 68200, 74000, 76500, 79000, 1.07, 8, "days", "RSI 28 · 이격도 88 · 직전 연속음봉 4 · 당일 반등", 0.018, true, 3),
  mk("000660", "SK하이닉스", "swing", "breakout", "regular", 0.8, 198000, 188000, 213000, 228000, 248000, 1.5, 6, "days", "20일 신고가 돌파 · 거래량 2.4x", 0.031, true, 11),
  mk("373220", "LG에너지솔루션", "day", "close_betting", "close", 0.66, 412000, 405000, 419000, 423500, 429000, 1.0, 5, "intraday", "당일 강세 양봉 · 종가 고가권 마감 · 거래량 증가", 0.012, true, 7),
  mk("035420", "NAVER", "position", "factor_composite", "regular", 0.61, 168000, 150000, 186000, 204000, 228000, 1.0, 10, "months", "합성 알파 섹터 상위 · 밸류 upside +18% · ROE 개선", -0.004, false, 5),
  mk("207940", "삼성바이오로직스", "swing", "leader_trend", "regular", 0.77, 1015000, 965000, 1080000, 1130000, 1210000, 1.3, 5, "days", "정배열(종가>MA20>MA60) · 상대강도 상위 12%", 0.022, true, 9),
  mk("005380", "현대차", "position", "factor_composite", "regular", 0.58, 242000, 222000, 262000, 280000, 305000, 1.0, 9, "months", "저PER·고배당 · 퀄리티 상위 · 수급 개선", 0.006, true, 4),
  mk("068270", "셀트리온", "swing", "oversold_bounce", "regular", 0.63, 178500, 170000, 188000, 196000, 208000, 1.12, 7, "days", "이격도 87 · RSI 31 · 거래량 동반 반등", 0.014, true, 6),
  mk("105560", "KB금융", "position", "leader_trend", "regular", 0.69, 78900, 73500, 84000, 89000, 96000, 1.0, 8, "weeks", "금융 섹터 주도 · 정배열 · 외인 순매수", 0.009, true, 8),
  mk("247540", "에코프로비엠", "day", "breakout", "regular", 0.71, 188000, 179000, 198000, 208000, 224000, 1.3, 4, "intraday", "전고 돌파 · 테마 강세 · 거래량 3.1x", 0.045, true, 13),
  mk("012450", "한화에어로스페이스", "swing", "leader_trend", "regular", 0.74, 312000, 296000, 332000, 350000, 378000, 1.25, 6, "days", "방산 주도주 · 신고가 경신 · 정배열", 0.027, true, 2),
  mk("000270", "기아", "position", "factor_composite", "regular", 0.6, 98700, 90000, 108000, 116000, 128000, 1.0, 9, "months", "밸류 매력 · FCF yield 상위 · 자사주 소각", 0.003, true, 1),
  mk("042700", "한미반도체", "day", "close_betting", "close", 0.64, 142000, 137000, 147000, 151000, 158000, 1.0, 5, "intraday", "종가 고가권 · HBM 모멘텀 · 거래 증가", 0.019, true, 10),
];

function mk(
  symbol: string, name: string, style: SignalView["style"], setup: SignalView["setup"],
  session: SignalView["session"], strength: number, entry: number, stop: number,
  tp1: number, tp2: number, tp3: number, rr: number, pos: number, hold: string,
  rationale: string, change: number, up: boolean, seed: number,
): Seed {
  return {
    symbol, name, exchange: "KRX", currency: "KRW",
    signal_type: "buy", style, setup, session, strength, timeframe:
      style === "scalping" ? "1m" : style === "day" ? "5m" : style === "swing" ? "1d" : "1w",
    entry_price: entry, stop_loss: stop, tp1, tp2, tp3, risk_reward: rr,
    position_size_pct: pos, holding_horizon: hold, llm_rationale: rationale,
    valid_until: null, change_pct: change, seedUp: up, seed,
  };
}

export const SAMPLE_SIGNALS: SignalView[] = SEED.map((s, i) => {
  const { seedUp, seed, ...rest } = s;
  return { ...rest, id: -(i + 1), created_at: new Date().toISOString(), spark: spark(seed, seedUp) };
});

export const SAMPLE_INSTRUMENT: InstrumentView = {
  id: -1, symbol: "005930", name: "삼성전자", exchange: "KRX", sector: "IT", currency: "KRW",
};
export const SAMPLE_VALUATION: ValuationView = {
  per: 11.2, pbr: 1.3, ev_ebitda: 5.4, roe: 0.116, dcf_value: 82000, upside_pct: 0.155,
};
export const SAMPLE_FACTOR: FactorView = {
  value_z: 0.8, quality_z: 1.1, momentum_z: -0.3, growth_z: 0.5,
  lowvol_z: 0.2, size_z: -1.4, composite_alpha: 0.62, sector_rank: 2,
};

// ── 심볼별 샘플 (종목 클릭 시 다른 데이터가 보이도록 결정적 변형) ──
const SYMBOL_META: Record<string, { name: string; sector: string }> = {
  "005930": { name: "삼성전자", sector: "반도체" },
  "000660": { name: "SK하이닉스", sector: "반도체" },
  "373220": { name: "LG에너지솔루션", sector: "2차전지" },
  "035420": { name: "NAVER", sector: "인터넷" },
  "207940": { name: "삼성바이오로직스", sector: "바이오" },
  "005380": { name: "현대차", sector: "자동차" },
  "068270": { name: "셀트리온", sector: "바이오" },
  "105560": { name: "KB금융", sector: "금융" },
  "247540": { name: "에코프로비엠", sector: "2차전지" },
  "012450": { name: "한화에어로스페이스", sector: "방산" },
  "000270": { name: "기아", sector: "자동차" },
  "042700": { name: "한미반도체", sector: "반도체" },
};

function seedOf(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) & 0x7fffffff;
  return h;
}
// seed 기반 [-1,1) 의사난수 (인덱스로 변주)
function rnd(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function sampleInstrumentFor(symbol: string): InstrumentView {
  const meta = SYMBOL_META[symbol];
  return {
    id: -Math.abs(seedOf(symbol)) - 1,
    symbol,
    name: meta?.name ?? symbol,
    exchange: "KRX",
    sector: meta?.sector ?? null,
    currency: "KRW",
  };
}

export function sampleValuationFor(symbol: string): ValuationView {
  const s = seedOf(symbol);
  const base = SAMPLE_SIGNALS.find((x) => x.symbol === symbol)?.entry_price ?? 70000;
  const upside = 0.05 + rnd(s, 1) * 0.18;
  return {
    per: Math.max(3, 12 + rnd(s, 2) * 9),
    pbr: Math.max(0.4, 1.4 + rnd(s, 3) * 1.1),
    ev_ebitda: Math.max(2, 6 + rnd(s, 4) * 4),
    roe: 0.1 + rnd(s, 5) * 0.08,
    dcf_value: Math.round((base * (1 + upside)) / 100) * 100,
    upside_pct: upside,
  };
}

export function sampleFactorFor(symbol: string): FactorView {
  const s = seedOf(symbol);
  const z = (k: number) => Math.round(rnd(s, k) * 1.8 * 10) / 10;
  const v = z(11), q = z(12), m = z(13), g = z(14), lv = z(15), sz = z(16);
  const alpha = Math.round(((v + q + m + g + lv + sz) / 6) * 100) / 100;
  return {
    value_z: v, quality_z: q, momentum_z: m, growth_z: g, lowvol_z: lv, size_z: sz,
    composite_alpha: alpha, sector_rank: 1 + (Math.abs(s) % 8),
  };
}

export function sampleRiskFor(symbol: string): RiskView {
  const s = seedOf(symbol);
  return {
    beta: Math.round((1 + rnd(s, 21) * 0.4) * 100) / 100,
    vol_annual: 0.22 + Math.abs(rnd(s, 22)) * 0.12,
    var_95: -(0.02 + Math.abs(rnd(s, 23)) * 0.02),
    max_drawdown: -(0.25 + Math.abs(rnd(s, 24)) * 0.2),
    factor_exposure: [
      { label: "시장", value: Math.round((1 + rnd(s, 25) * 0.3) * 100) / 100 },
      { label: "사이즈", value: Math.round(rnd(s, 26) * 100) / 100 },
      { label: "밸류", value: Math.round(rnd(s, 27) * 100) / 100 },
      { label: "모멘텀", value: Math.round(rnd(s, 28) * 100) / 100 },
    ],
  };
}

export function sampleFlowsFor(symbol: string): FlowRowView[] {
  const s = seedOf(symbol);
  return Array.from({ length: 8 }, (_, i) => ({
    date: `2026-05-${String(20 + i).padStart(2, "0")}`,
    inst_net: Math.round(rnd(s, 100 + i) * 5000),
    foreign_net: Math.round(rnd(s, 200 + i) * 7000),
    retail_net: Math.round(rnd(s, 300 + i) * 4000),
    short_volume: Math.round(Math.abs(rnd(s, 400 + i)) * 120),
  }));
}

// ── 시장(마켓) ──
export const SAMPLE_REGIME: RegimeView = {
  regime: "risk_on",
  score: 0.38,
  drivers: ["미 10년물 안정", "외인 순매수 5일 연속", "신용스프레드 축소", "반도체 업황 개선"],
};
export const SAMPLE_MACRO: MacroSeriesView[] = [
  { series_id: "DGS10", label: "미 국채 10Y", value: 4.21, unit: "%", change: -0.06, spark: spark(2, false) },
  { series_id: "USDKRW", label: "원/달러", value: 1372.5, unit: "원", change: -4.3, spark: spark(5, false) },
  { series_id: "BOK_BASE", label: "한은 기준금리", value: 3.0, unit: "%", change: 0.0, spark: spark(9, true) },
  { series_id: "KOSPI", label: "KOSPI", value: 2731.2, unit: "p", change: 0.92, spark: spark(3, true) },
  { series_id: "VIX", label: "VIX", value: 14.3, unit: "", change: -0.8, spark: spark(7, false) },
  { series_id: "WTI", label: "WTI 유가", value: 78.4, unit: "$", change: 1.1, spark: spark(11, true) },
];
export const SAMPLE_SECTORS: SectorRotationView[] = [
  { sector: "반도체", momentum: 1.8, flow: 4200 },
  { sector: "2차전지", momentum: 1.1, flow: 1850 },
  { sector: "방산", momentum: 0.9, flow: 1320 },
  { sector: "바이오", momentum: 0.3, flow: 410 },
  { sector: "인터넷", momentum: -0.2, flow: -260 },
  { sector: "자동차", momentum: 0.5, flow: 720 },
  { sector: "금융", momentum: 0.7, flow: 980 },
  { sector: "건설", momentum: -0.8, flow: -540 },
];

// ── 모델 포트폴리오 ──
export const SAMPLE_RECS: RecommendationView[] = [
  rec("퀄리티 가치", "position", "005930", "삼성전자", 0.18, 0.74, "저PER·고ROE·외인 순매수 전환", 71000, 86000, 64000),
  rec("퀄리티 가치", "position", "000270", "기아", 0.14, 0.7, "FCF yield 상위·자사주 소각", 98700, 120000, 88000),
  rec("퀄리티 가치", "position", "105560", "KB금융", 0.13, 0.68, "금융 주도·배당 매력", 78900, 96000, 71000),
  rec("퀄리티 가치", "position", "035420", "NAVER", 0.12, 0.62, "밸류 upside +18%", 168000, 204000, 150000),
  rec("모멘텀 주도주", "swing", "000660", "SK하이닉스", 0.16, 0.8, "HBM 모멘텀·신고가 돌파", 198000, 248000, 180000),
  rec("모멘텀 주도주", "swing", "012450", "한화에어로스페이스", 0.15, 0.74, "방산 주도주·정배열", 312000, 378000, 290000),
];
export const SAMPLE_BACKTESTS: BacktestView[] = [
  bt("leader_trend", "swing", 0.041, 1.32, 0.18, 1.9, 0.54, 1.8, true),
  bt("oversold_bounce", "swing", 0.028, 0.96, 0.22, 2.4, 0.48, 1.6, true),
  bt("breakout", "swing", 0.052, 1.41, 0.16, 3.1, 0.51, 2.0, true),
  bt("close_betting", "day", 0.012, 0.61, 0.27, 5.2, 0.46, 1.2, false),
  bt("factor_composite", "position", 0.067, 1.58, 0.14, 0.6, 0.57, 1.7, true),
];

// ── 종목상세 수급/리스크 ──
export const SAMPLE_FLOWS: FlowRowView[] = Array.from({ length: 8 }, (_, i) => {
  const s = (i * 2654435761) % 100;
  return {
    date: `2026-05-${String(20 + i).padStart(2, "0")}`,
    inst_net: Math.round((s - 40) * 120),
    foreign_net: Math.round((60 - s) * 180),
    retail_net: Math.round((s - 50) * -90),
    short_volume: Math.round(s * 1.2),
  };
});
export const SAMPLE_RISK: RiskView = {
  beta: 1.08,
  vol_annual: 0.262,
  var_95: -0.027,
  max_drawdown: -0.34,
  factor_exposure: [
    { label: "시장", value: 1.08 },
    { label: "사이즈", value: -0.4 },
    { label: "밸류", value: 0.3 },
    { label: "모멘텀", value: 0.1 },
  ],
};

function rec(
  basket: string, style: RecommendationView["style"], symbol: string, name: string,
  weight: number, conv: number, thesis: string, entry: number, target: number, stop: number,
): RecommendationView {
  return { basket_type: basket, style, symbol, name, weight, conviction: conv, thesis,
    entry_price: entry, target_price: target, stop_loss: stop };
}
function bt(
  setup: BacktestView["setup"], style: BacktestView["style"], ic: number, sharpe: number,
  mdd: number, turnover: number, win: number, rr: number, passed: boolean,
): BacktestView {
  return { setup, style, ic, sharpe, mdd, turnover, win_rate: win, avg_rr: rr,
    period: "2019–2025", passed };
}
