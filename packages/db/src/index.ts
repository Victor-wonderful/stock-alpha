// @stock-alpha/db — 스키마 공유 타입 (단일 출처: supabase/migrations)
// 전체 Database 타입은 `npm run gen:types`(supabase gen types)로 database.types.ts 생성.
// 아래는 손으로 유지하는 도메인 enum/핵심 타입 — 웹·서버 양쪽에서 import.

// ── ENUM (supabase/migrations 와 동기화) ──
export type TradeStyle = 'scalping' | 'day' | 'swing' | 'position';
export type SignalKind = 'buy' | 'sell' | 'hold';
export type SubTier = 'free' | 'pro' | 'premium' | 'bot';
export type ReportKind = 'indepth' | 'market' | 'portfolio' | 'custom';
export type FsKind = 'consolidated' | 'separate';
export type AssetKind = 'stock' | 'etf' | 'index';

// 시그널 3축: style(보유기간) × setup(플레이북) × session(세션)
export type TradeSetup =
  | 'factor_composite'
  | 'leader_trend'
  | 'oversold_bounce'
  | 'breakout'
  | 'close_betting'
  | 'flow_accumulation'
  | 'pullback'
  | 'high_52w'
  | 'vol_squeeze'
  | 'pead'
  | 'double_bottom'
  | 'anchor_pullback'
  | 'theme'
  | 'new_listing';
export type TradeSession = 'pre' | 'regular' | 'close' | 'after';

export const TRADE_STYLES: TradeStyle[] = ['scalping', 'day', 'swing', 'position'];

export const TRADE_STYLE_LABELS: Record<TradeStyle, string> = {
  scalping: '스캘핑',
  day: '데이트레이딩',
  swing: '스윙',
  position: '포지션',
};

export const TRADE_SETUP_LABELS: Record<TradeSetup, string> = {
  factor_composite: '멀티팩터 종합',
  leader_trend: '주도주 추세',
  oversold_bounce: '과대낙폭 반등',
  breakout: '돌파',
  close_betting: '종가베팅',
  flow_accumulation: '수급 동반 매집',
  pullback: '눌림목',
  high_52w: '52주 신고가',
  vol_squeeze: '변동성 수축 돌파',
  pead: '실적 모멘텀(PEAD)',
  double_bottom: '쌍바닥(W) 반등',
  anchor_pullback: '기준봉 눌림',
  theme: '테마주',
  new_listing: '신규주',
};

export const TRADE_SESSION_LABELS: Record<TradeSession, string> = {
  pre: '프리장',
  regular: '정규장',
  close: '종가단일가',
  after: '애프터장',
};

export const TIER_RANK: Record<SubTier, number> = {
  free: 0,
  pro: 1,
  premium: 2,
  bot: 3,
};

// ── 핵심 행 타입 (자주 쓰는 것 우선; 전체는 database.types.ts) ──
export interface Instrument {
  id: number;
  symbol: string;
  exchange: string;
  name: string;
  sector: string | null;
  industry: string | null;
  asset_type: AssetKind;
  currency: string;
  active: boolean;
}

export interface Signal {
  id: number;
  instrument_id: number;
  created_at: string;
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
  rule_payload: unknown;
  factor_payload: unknown;
  level_payload: unknown;
  llm_rationale: string | null;
  source_version: string | null;
  valid_until: string | null;
}

export interface Profile {
  id: string;
  tier: SubTier;
  default_style: TradeStyle;
  risk_per_trade_pct: number;
  display_name: string | null;
}

export interface FactorScore {
  instrument_id: number;
  date: string;
  value_z: number | null;
  quality_z: number | null;
  momentum_z: number | null;
  growth_z: number | null;
  lowvol_z: number | null;
  size_z: number | null;
  composite_alpha: number | null;
  sector_rank: number | null;
}
