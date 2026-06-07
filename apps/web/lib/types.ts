import type {
  SignalKind,
  TradeSession,
  TradeSetup,
  TradeStyle,
} from "@stock-alpha/db";

// 화면 표시용 시그널 뷰모델 (signals + instruments 조인)
export interface SignalView {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  signal_type: SignalKind;
  style: TradeStyle;
  setup: TradeSetup;
  session: TradeSession;
  strength: number;
  timeframe: string;
  entry_price: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  risk_reward: number | null;
  position_size_pct: number | null;
  holding_horizon: string | null;
  llm_rationale: string | null;
  valid_until: string | null;
  created_at: string;
  // 표시 보강(선택) — 실데이터 연결 시 시세에서 계산
  change_pct?: number | null;
  spark?: number[];
}

export interface InstrumentView {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  currency: string;
}

export interface ValuationView {
  per: number | null;
  pbr: number | null;
  ev_ebitda: number | null;
  roe: number | null;
  dcf_value: number | null;
  upside_pct: number | null;
}

export interface FactorView {
  value_z: number | null;
  quality_z: number | null;
  momentum_z: number | null;
  growth_z: number | null;
  lowvol_z: number | null;
  size_z: number | null;
  composite_alpha: number | null;
  sector_rank: number | null;
}

// ── 시장(마켓) ──
export type Regime = "risk_on" | "neutral" | "risk_off";
export interface RegimeView {
  regime: Regime;
  score: number; // -1(위험회피) ~ 1(위험선호)
  drivers: string[];
}
export interface MacroSeriesView {
  series_id: string;
  label: string;
  value: number;
  unit: string;
  change: number; // 전기 대비
  spark: number[];
}
export interface SectorRotationView {
  sector: string;
  momentum: number; // 상대 모멘텀
  flow: number; // 수급(외인+기관 순매수, 억원)
}

// ── 모델 포트폴리오 / 추천 ──
export interface RecommendationView {
  basket_type: string;
  style: TradeStyle;
  symbol: string;
  name: string;
  weight: number; // 0~1
  conviction: number; // 0~1
  thesis: string;
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
}

// ── 전략·백테스트 ──
export interface BacktestView {
  setup: TradeSetup;
  style: TradeStyle | null;
  ic: number | null;
  sharpe: number | null;
  mdd: number | null;
  turnover: number | null;
  win_rate: number | null;
  avg_rr: number | null;
  period: string | null;
  passed: boolean;
}

// ── 수급 (종목 상세) ──
export interface FlowRowView {
  date: string;
  inst_net: number | null;
  foreign_net: number | null;
  retail_net: number | null;
  short_volume: number | null;
}

// ── 리스크 (종목 상세) ──
export interface RiskView {
  beta: number | null;
  vol_annual: number | null; // 연율 변동성
  var_95: number | null; // 1일 95% VaR(%)
  max_drawdown: number | null;
  factor_exposure: { label: string; value: number }[];
}

// 데이터 조회 결과 — 비어 있거나 DB 미연결 시 isSample 로 폴백 여부 표시
export interface Loaded<T> {
  data: T;
  isSample: boolean;
}
