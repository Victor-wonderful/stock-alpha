// DB(Supabase) → 모바일 화면 shape 매핑 레이어.
// 웹 apps/web/lib/data.ts 의 쿼리를 모바일 anon 클라이언트로 옮긴 것.
// 모든 함수는 Loaded<T> 를 반환하고, 미설정/실패 시 목업으로 폴백(isSample=true).
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { changePct, fmtPrice, riskReward, fmtPct } from '@/lib/format';
import type { Loaded } from '@/lib/use-query';
import type { PickData, PickBadge } from '@/components/pick-card';
import { picks as SAMPLE_PICKS } from '@/data/recommend';
import {
  focusPicks as SAMPLE_FOCUS,
  heroStat as SAMPLE_HERO,
  markets as SAMPLE_MARKETS,
  reports as SAMPLE_REPORTS,
  type FocusPick,
  type ReportRow,
} from '@/data/home';
import { signals as SAMPLE_SIGNALS, type Signal } from '@/data/screener';
import { report as SAMPLE_REPORT, type ReportDetail } from '@/data/report';
import { getStock, type StockDetail } from '@/data/stock';

// trade_style enum → 한국어 라벨 (signals/recommendations.style)
const STYLE_LABEL: Record<string, string> = {
  scalping: '스캘핑',
  day: '데이',
  swing: '스윙',
  position: '포지션',
};

// trade_setup enum → 한국어 라벨 (packages/db TRADE_SETUP_LABELS 미러 — Metro 값 import 회피).
const SETUP_LABEL: Record<string, string> = {
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
  kalman: '칼만 추세',
  sigma: '시그마 평균회귀',
  pivot: '피봇 돌파',
  median: '메디안 추세',
  delta: '델타(AR1) 모멘텀',
  markov: '마르코프 레짐',
  quantile: '콴타일 반등',
  ensemble: '앙상블 합의',
  sortino: '소르티노 모멘텀',
  bayes: '베이즈 결합',
  theme: '테마주',
  new_listing: '신규주',
};
// 보유기간 라벨 — holding_horizon 또는 style 기반 보조 문구.
const STYLE_HORIZON: Record<string, string> = {
  scalping: '분~시간',
  day: '당일',
  swing: '수일~수주',
  position: '수주~수개월',
};

// 섹터중립 z-score(대략 -3~+3) → 0~100. (snowflake.ts 와 동일 산식)
const clamp = (x: number, lo = 5, hi = 95) => Math.max(lo, Math.min(hi, x));
const zTo100 = (z: number | null | undefined) => (z == null ? 50 : Math.round(clamp(50 + z * 16.67)));

type FactorRow = {
  instrument_id: number;
  value_z: number | null;
  momentum_z: number | null;
  growth_z: number | null;
  lowvol_z: number | null;
  composite_alpha: number | null;
};

// factor_scores 한 행 → 스노우플레이크 5축(밸류·수급·모멘텀·성장·안정성).
// 수급은 picks 리스트에서 별도 조회하지 않으므로 모멘텀/성장 평균으로 근사(중립 편향).
function snowflakeFromFactor(f: FactorRow | undefined) {
  const value = zTo100(f?.value_z);
  const momentum = zTo100(f?.momentum_z);
  const growth = zTo100(f?.growth_z);
  const stability = zTo100(f?.lowvol_z);
  const flow = Math.round((momentum + value) / 2); // 수급 축 근사 — 상세화면에서 정밀 산출
  const scores = [value, flow, momentum, growth, stability];
  const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const health = Math.max(1, Math.min(5, Math.round(score / 20)));
  return { scores, health, score };
}

type RecRow = {
  instrument_id: number;
  basket_type: string;
  style: string;
  weight: number | null;
  conviction: number | null;
  thesis: string | null;
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  as_of: string;
  setup: string | null;
  instruments: { symbol: string; name: string } | null;
};

function mapPick(r: RecRow, factor: FactorRow | undefined): PickData {
  const inst = r.instruments ?? { symbol: '', name: '' };
  const styleLabel = STYLE_LABEL[r.style] ?? r.style;
  const badges: PickBadge[] = [
    { text: `${styleLabel} · ${STYLE_HORIZON[r.style] ?? ''}`.trim(), kind: 'neutral' },
  ];
  if (r.setup) badges.push({ text: r.setup, kind: 'good' });
  badges.push({ text: '검증', kind: 'good' });

  return {
    name: inst.name,
    code: inst.symbol,
    status: { text: '진입 대기', kind: 'wait' }, // 라이브 가격 비교는 상세화면에서
    badges,
    reason: r.thesis ?? '',
    entry: fmtPrice(r.entry_price),
    target: fmtPrice(r.target_price),
    targetPct: changePct(r.entry_price, r.target_price),
    stop: fmtPrice(r.stop_loss),
    stopPct: changePct(r.entry_price, r.stop_loss),
    rr: riskReward(r.entry_price, r.target_price, r.stop_loss),
    weight: r.weight != null ? fmtPct(r.weight, { unit: 'ratio', digits: 1 }).replace('+', '') : '—',
    score: Math.round((r.conviction ?? 0) * 100),
    snowflake: snowflakeFromFactor(factor),
  };
}

// 해당 종목들의 최신 factor_scores 를 instrument_id→행 맵으로.
async function factorMap(instrumentIds: number[]): Promise<Map<number, FactorRow>> {
  const map = new Map<number, FactorRow>();
  if (instrumentIds.length === 0) return map;
  const { data } = await supabase
    .from('factor_scores')
    .select('instrument_id,value_z,momentum_z,growth_z,lowvol_z,composite_alpha,date')
    .in('instrument_id', instrumentIds)
    .order('date', { ascending: false });
  for (const row of (data ?? []) as (FactorRow & { date: string })[]) {
    if (!map.has(row.instrument_id)) map.set(row.instrument_id, row); // 최신만
  }
  return map;
}

// 추천 화면 — 오늘의 픽. recommendations(daily_focus) 최신 스냅샷.
export async function getRecommendedPicks(): Promise<Loaded<PickData[]>> {
  if (!hasSupabaseConfig) return { data: SAMPLE_PICKS, isSample: true };
  try {
    const { data, error } = await supabase
      .from('recommendations')
      .select(
        'instrument_id,basket_type,style,weight,conviction,thesis,entry_price,target_price,stop_loss,as_of,setup,instruments(symbol,name)',
      )
      .eq('basket_type', 'daily_focus')
      .order('as_of', { ascending: false })
      .order('conviction', { ascending: false })
      .limit(20);
    if (error || !data || data.length === 0) throw error ?? new Error('empty');

    // 최신 as_of 스냅샷만 (지난 날짜 픽 섞임 방지)
    const rows = data as unknown as RecRow[];
    const latest = rows[0].as_of;
    const current = rows.filter((r) => r.as_of === latest);

    const factors = await factorMap(current.map((r) => r.instrument_id));
    return { data: current.map((r) => mapPick(r, factors.get(r.instrument_id))), isSample: false };
  } catch {
    return { data: SAMPLE_PICKS, isSample: true };
  }
}

// 홈 — 오늘의 포커스(상위 3). 추천 픽을 작은 카드 shape 으로.
export async function getFocusPicks(): Promise<Loaded<FocusPick[]>> {
  if (!hasSupabaseConfig) return { data: SAMPLE_FOCUS, isSample: true };
  try {
    const { data, error } = await supabase
      .from('recommendations')
      .select('instrument_id,style,entry_price,target_price,conviction,as_of,instruments(symbol,name)')
      .eq('basket_type', 'daily_focus')
      .order('as_of', { ascending: false })
      .order('conviction', { ascending: false })
      .limit(10);
    if (error || !data || data.length === 0) throw error ?? new Error('empty');
    const rows = data as unknown as RecRow[];
    const latest = rows[0].as_of;
    const focus: FocusPick[] = rows
      .filter((r) => r.as_of === latest)
      .slice(0, 3)
      .map((r) => {
        const styleLabel = (STYLE_LABEL[r.style] ?? '스윙') as FocusPick['style'];
        return {
          name: r.instruments?.name ?? '',
          code: r.instruments?.symbol ?? '',
          style: (['스윙', '데이', '포지션'].includes(styleLabel) ? styleLabel : '스윙') as FocusPick['style'],
          entry: `진입 ${fmtPrice(r.entry_price)}`,
          tp: changePct(r.entry_price, r.target_price),
          score: String(Math.round((r.conviction ?? 0) * 100)),
        };
      });
    return { data: focus, isSample: false };
  } catch {
    return { data: SAMPLE_FOCUS, isSample: true };
  }
}

// ── 스크리너 (시그널 = 셋업 트리거 기록) ──
type SigRow = {
  instrument_id: number;
  style: string;
  setup: string;
  strength: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  tp1: number | null;
  risk_reward: number | null;
  instruments: { symbol: string; name: string } | null;
};

// 강도(0~1) → 매수/중립/관망 (시그널은 추천 아님 — 강도 구간으로 표기)
function verdictOf(strength: number): Signal['verdict'] {
  if (strength >= 0.7) return '매수';
  if (strength >= 0.5) return '중립';
  return '관망';
}
// 합성알파(σ) 표기 — factor_scores.composite_alpha
function fmtSigma(a: number | null | undefined): string {
  if (a == null) return '—';
  return `${a >= 0 ? '+' : ''}${a.toFixed(1)}σ`;
}

function mapSignalRow(r: SigRow, factor: FactorRow | undefined): Signal {
  const inst = r.instruments ?? { symbol: '', name: '' };
  const strength = r.strength ?? 0;
  return {
    name: inst.name,
    code: inst.symbol,
    init: inst.name.slice(0, 2),
    setup: SETUP_LABEL[r.setup] ?? r.setup,
    style: STYLE_LABEL[r.style] ?? r.style,
    entry: fmtPrice(r.entry_price),
    target: fmtPrice(r.tp1),
    targetPct: changePct(r.entry_price, r.tp1),
    stop: fmtPrice(r.stop_loss),
    stopPct: changePct(r.entry_price, r.stop_loss),
    rr: r.risk_reward != null ? r.risk_reward.toFixed(1) : riskReward(r.entry_price, r.tp1, r.stop_loss),
    alpha: fmtSigma(factor?.composite_alpha),
    verdict: verdictOf(strength),
    score: Math.round(strength * 100),
  };
}

// 스크리너 화면 — 시그널 강도순 상위. (웹 getSignals 모바일판, 강도 내림차순)
export async function getScreenerSignals(): Promise<Loaded<Signal[]>> {
  if (!hasSupabaseConfig) return { data: SAMPLE_SIGNALS, isSample: true };
  try {
    const { data, error } = await supabase
      .from('signals')
      .select(
        'instrument_id,style,setup,strength,entry_price,stop_loss,tp1,risk_reward,instruments!inner(symbol,name)',
      )
      .order('strength', { ascending: false })
      .limit(30);
    if (error || !data || data.length === 0) throw error ?? new Error('empty');
    const rows = data as unknown as SigRow[];
    const factors = await factorMap(rows.map((r) => r.instrument_id));
    return { data: rows.map((r) => mapSignalRow(r, factors.get(r.instrument_id))), isSample: false };
  } catch {
    return { data: SAMPLE_SIGNALS, isSample: true };
  }
}

// ── 홈 대시보드 히어로 KPI (웹 getDashboardKpi 모바일판) ──
// 오늘의 픽 수 · 오늘 발행 리포트 수 · 백테스트 통과/전체 + 진행중 픽 평균수익률.
export async function getDashboardKpi(): Promise<Loaded<typeof SAMPLE_HERO>> {
  if (!hasSupabaseConfig) return { data: SAMPLE_HERO, isSample: true };
  try {
    // 최신 as_of 의 daily_focus 픽(+진입가·종목)
    const { data: lf } = await supabase
      .from('recommendations')
      .select('as_of')
      .eq('basket_type', 'daily_focus')
      .order('as_of', { ascending: false })
      .limit(1);
    const latest = lf?.[0]?.as_of as string | undefined;
    if (!latest) throw new Error('no picks');
    const { data: picks } = await supabase
      .from('recommendations')
      .select('instrument_id,entry_price')
      .eq('basket_type', 'daily_focus')
      .eq('as_of', latest);
    const picksToday = picks?.length ?? 0;

    // 오늘 발행 리포트 수(최신 발행일 기준)
    const { data: lr } = await supabase
      .from('reports')
      .select('as_of')
      .eq('status', 'published')
      .eq('report_type', 'indepth')
      .order('as_of', { ascending: false })
      .limit(1);
    let reportsToday = 0;
    const latestRep = lr?.[0]?.as_of as string | undefined;
    if (latestRep) {
      const { count } = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('report_type', 'indepth')
        .eq('as_of', latestRep);
      reportsToday = count ?? 0;
    }

    // 백테스트 통과 현황(셋업|스타일 최신 1건씩)
    const { data: bts } = await supabase
      .from('backtests')
      .select('setup,style,passed,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    const seen = new Set<string>();
    let passed = 0;
    let total = 0;
    for (const r of (bts ?? []) as { setup: string; style: string | null; passed: boolean }[]) {
      const k = `${r.setup}|${r.style ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      total++;
      if (r.passed === true) passed++;
    }

    // 진행중 픽 평균 수익률 — 최신 종가/진입가 − 1.
    const ids = (picks ?? []).map((p) => p.instrument_id as number);
    let activeReturn: number | null = null;
    if (ids.length > 0) {
      const { data: bars } = await supabase
        .from('ohlcv')
        .select('instrument_id,close,ts')
        .eq('interval', '1d')
        .in('instrument_id', ids)
        .order('ts', { ascending: false });
      const lastClose = new Map<number, number>();
      for (const b of (bars ?? []) as { instrument_id: number; close: number }[]) {
        if (!lastClose.has(b.instrument_id)) lastClose.set(b.instrument_id, Number(b.close));
      }
      const rets: number[] = [];
      for (const p of picks ?? []) {
        const c = lastClose.get(p.instrument_id as number);
        const e = p.entry_price as number | null;
        if (c != null && e != null && e > 0) rets.push(c / e - 1);
      }
      if (rets.length > 0) activeReturn = rets.reduce((a, b) => a + b, 0) / rets.length;
    }

    return {
      data: {
        label: '진행중 픽 수익률',
        value: activeReturn != null ? fmtPct(activeReturn, { unit: 'ratio' }) : '—',
        positive: (activeReturn ?? 0) >= 0,
        sub: '전체 발행 기준 · 삭제 없음',
        kpis: [
          { label: '오늘의 픽', value: `${picksToday}종목`, accent: false },
          { label: '발행 리포트', value: `${reportsToday}건`, accent: false },
          { label: '검증 통과 전략', value: `${passed} / ${total}`, accent: true },
        ],
      },
      isSample: false,
    };
  } catch {
    return { data: SAMPLE_HERO, isSample: true };
  }
}

// ── 홈 최신 분석 리포트(상위 3) — 발행된 인뎁스 리포트(거래 부적합 제외) ──
type RepRow = {
  id: number;
  title: string | null;
  summary: string | null;
  rating: string | null;
  score: number | string | null;
  instruments: { symbol: string; name: string } | null;
};

export async function getHomeReports(): Promise<Loaded<ReportRow[]>> {
  if (!hasSupabaseConfig) return { data: SAMPLE_REPORTS, isSample: true };
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('id,title,summary,rating,score:payload->verdict->>score,instruments(symbol,name)')
      .eq('status', 'published')
      .eq('report_type', 'indepth')
      .neq('rating', '거래 부적합')
      .order('as_of', { ascending: false })
      .order('id', { ascending: false })
      .limit(3);
    if (error || !data || data.length === 0) throw error ?? new Error('empty');
    const rows = data as unknown as RepRow[];
    return {
      data: rows.map((r) => {
        const sc = r.score != null ? Math.round(Number(r.score)) : null;
        return {
          id: r.id,
          name: r.instruments?.name ?? r.title ?? '',
          line: r.summary ?? r.title ?? '',
          score: sc != null ? String(sc) : '—',
          tone: sc != null && sc >= 80 ? 'good' : 'warn',
        } as ReportRow;
      }),
      isSample: false,
    };
  } catch {
    return { data: SAMPLE_REPORTS, isSample: true };
  }
}

// ── 픽 트랙레코드 (웹 getPickHistory 모바일판) ──
// 발행한 daily_focus 픽을 '포지션' 단위로 합산(연속 재선정 흡수) → 진행중·목표·손절 집계.
// 종가 기반 추정(장중 터치 미반영). 열린 픽은 최신 종가를 일괄 조회(웹 N+1 개선).
export type PerfState = '진행중' | '목표 달성' | '손절' | '만료' | '1차 익절' | '—';
export type PickRec = {
  name: string;
  code: string;
  state: PerfState;
  date: string;
  setup: string;
  entry: string;
  target: string;
  stop: string;
  ret: string;
  retKind: 'good' | 'bad' | 'muted';
};
export type PickTrack = {
  records: PickRec[];
  total: number;
  target: number;
  stopped: number;
  open: number;
  expired: number;
  avgClosed: string; // 확정(종결) 픽 평균 수익률
};

const PICK_STATUS_LABELS: Record<string, PerfState> = {
  target: '목표 달성',
  stopped: '손절',
  expired: '만료',
  partial: '1차 익절',
};

// 목업 폴백 (성과 화면·홈 트랙레코드 공통)
export const SAMPLE_PICK_TRACK: PickTrack = {
  records: [
    { name: 'SK스퀘어', code: '402340', state: '진행중', date: '6/12', setup: '52주 신고가', entry: '158,000', target: '171,000', stop: '151,800', ret: '진행 중', retKind: 'muted' },
    { name: '한미반도체', code: '042700', state: '목표 달성', date: '6/05', setup: '눌림목', entry: '105,000', target: '118,000', stop: '99,000', ret: '+12.4%', retKind: 'good' },
    { name: '포스코퓨처엠', code: '003670', state: '손절', date: '5/28', setup: '주도주 추세', entry: '248,000', target: '278,000', stop: '228,000', ret: '−8.1%', retKind: 'bad' },
  ],
  total: 47,
  target: 18,
  stopped: 9,
  open: 7,
  expired: 13,
  avgClosed: '+4.1%',
};

type PickHistRow = {
  as_of: string;
  entry_price: number | null;
  target_price: number | null;
  tp2_price: number | null;
  stop_loss: number | null;
  tp1_hit: boolean | null;
  instrument_id: number;
  status: string | null;
  closed_at: string | null;
  exit_price: number | null;
  close_return_pct: number | null;
  setup: string | null;
  instruments: { symbol: string; name: string } | null;
};

function mmdd(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso.slice(5).replace('-', '/');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export async function getPickTrack(limit = 60): Promise<Loaded<PickTrack>> {
  if (!hasSupabaseConfig) return { data: SAMPLE_PICK_TRACK, isSample: true };
  try {
    const { data, error } = await supabase
      .from('recommendations')
      .select(
        'as_of,entry_price,target_price,tp2_price,stop_loss,tp1_hit,instrument_id,status,closed_at,exit_price,close_return_pct,setup,instruments(symbol,name)',
      )
      .eq('basket_type', 'daily_focus')
      .order('as_of', { ascending: false })
      .limit(limit);
    if (error || !data || data.length === 0) throw error ?? new Error('empty');
    const rows = data as unknown as PickHistRow[];

    // 열린 픽의 최신 종가 일괄 조회 (웹은 픽마다 1쿼리 → 여기선 in() 1쿼리)
    const openIds = rows.filter((r) => !r.status || r.status === 'open').map((r) => r.instrument_id);
    const lastClose = new Map<number, number>();
    if (openIds.length > 0) {
      const { data: bars } = await supabase
        .from('ohlcv')
        .select('instrument_id,close,ts')
        .eq('interval', '1d')
        .in('instrument_id', openIds)
        .order('ts', { ascending: false });
      for (const b of (bars ?? []) as { instrument_id: number; close: number }[]) {
        if (!lastClose.has(b.instrument_id)) lastClose.set(b.instrument_id, Number(b.close));
      }
    }

    type Internal = {
      as_of: string; symbol: string; name: string;
      entry: number | null; target: number | null; stop: number | null;
      setup: string; state: PerfState; ret: number | null; closed: boolean; closed_at: string | null;
    };
    const recs: Internal[] = rows.map((r) => {
      const inst = r.instruments ?? { symbol: '', name: '' };
      const base = {
        as_of: r.as_of, symbol: inst.symbol, name: inst.name,
        entry: r.entry_price, target: r.target_price, stop: r.stop_loss,
        setup: r.setup ?? '', closed_at: r.closed_at,
      };
      // 엔진이 확정(0017)한 픽 — 기록된 청산 결과 그대로
      if (r.status && r.status !== 'open') {
        return { ...base, state: PICK_STATUS_LABELS[r.status] ?? '—', ret: r.close_return_pct, closed: true };
      }
      // 열린 픽 — 최신 종가로 추정. 1차 익절(0022) 후엔 본전 스톱·tp2 기준.
      const tp1Hit = Boolean(r.tp1_hit);
      const last = lastClose.get(r.instrument_id) ?? null;
      const ret = r.entry_price != null && r.entry_price > 0 && last != null ? last / r.entry_price - 1 : null;
      const effStop = tp1Hit && r.entry_price != null ? r.entry_price : r.stop_loss;
      const effTarget = tp1Hit && r.tp2_price != null ? r.tp2_price : r.target_price;
      let state: PerfState = '—';
      if (last != null && r.entry_price != null) {
        if (effStop != null && last <= effStop) state = tp1Hit ? '1차 익절' : '손절';
        else if (effTarget != null && last >= effTarget) state = '목표 달성';
        else state = '진행중';
      }
      return { ...base, state, ret, closed: false };
    });

    // 포지션 단위 dedup — 보유 창 내 재선정은 첫 픽으로 흡수(웹 동일).
    const bySymbol = new Map<string, Internal[]>();
    for (const r of recs) {
      const arr = bySymbol.get(r.symbol);
      if (arr) arr.push(r);
      else bySymbol.set(r.symbol, [r]);
    }
    const positions: Internal[] = [];
    for (const picks of bySymbol.values()) {
      picks.sort((a, b) => a.as_of.localeCompare(b.as_of));
      let cur: Internal | null = null;
      for (const p of picks) {
        const within = cur != null && (cur.closed_at == null || p.as_of <= cur.closed_at);
        if (!(within && cur)) {
          cur = p;
          positions.push(cur);
        }
      }
    }
    positions.sort((a, b) => b.as_of.localeCompare(a.as_of));

    const records: PickRec[] = positions.map((p) => {
      let ret = '진행 중';
      let retKind: PickRec['retKind'] = 'muted';
      if (p.state !== '진행중' && p.ret != null) {
        ret = fmtPct(p.ret, { unit: 'ratio' });
        retKind = p.ret >= 0 ? 'good' : 'bad';
      }
      return {
        name: p.name, code: p.symbol, state: p.state, date: mmdd(p.as_of),
        setup: SETUP_LABEL[p.setup] ?? p.setup,
        entry: fmtPrice(p.entry), target: fmtPrice(p.target), stop: fmtPrice(p.stop),
        ret, retKind,
      };
    });
    const closedRets = positions.filter((p) => p.closed && p.ret != null).map((p) => p.ret as number);
    const avg = closedRets.length > 0 ? closedRets.reduce((a, b) => a + b, 0) / closedRets.length : null;
    return {
      data: {
        records,
        total: positions.length,
        target: positions.filter((p) => p.state === '목표 달성').length,
        stopped: positions.filter((p) => p.state === '손절').length,
        open: positions.filter((p) => p.state === '진행중').length,
        expired: positions.filter((p) => p.state === '만료').length,
        avgClosed: avg != null ? fmtPct(avg, { unit: 'ratio' }) : '—',
      },
      isSample: false,
    };
  } catch {
    return { data: SAMPLE_PICK_TRACK, isSample: true };
  }
}

// ── 시장 한눈에 (홈 지수 4종) — macro 테이블 최신·전일대비 ──
const INDEX_META = [
  { id: 'KOSPI', name: 'KOSPI', digits: 2 },
  { id: 'SP500', name: 'S&P 500', digits: 2 },
  { id: 'NASDAQCOM', name: 'NASDAQ', digits: 2 },
  { id: 'VIXCLS', name: 'VIX', digits: 2 },
];

export async function getMarketIndices(): Promise<Loaded<typeof SAMPLE_MARKETS>> {
  if (!hasSupabaseConfig) return { data: SAMPLE_MARKETS, isSample: true };
  try {
    const ids = INDEX_META.map((m) => m.id);
    const { data, error } = await supabase
      .from('macro')
      .select('series_id,date,value')
      .in('series_id', ids)
      .order('date', { ascending: false });
    if (error || !data || data.length === 0) throw error ?? new Error('empty');
    // series 별 최신→과거 값 배열(최신이 [0])
    const bySeries = new Map<string, number[]>();
    for (const r of data as { series_id: string; value: number }[]) {
      const a = bySeries.get(r.series_id) ?? [];
      a.push(Number(r.value));
      bySeries.set(r.series_id, a);
    }
    const cards = INDEX_META.flatMap((m) => {
      const vals = bySeries.get(m.id);
      if (!vals || vals.length === 0) return [];
      const v = vals[0];
      const prev = vals.length > 1 ? vals[1] : v;
      const pct = prev !== 0 ? (v - prev) / prev : 0;
      return [{
        name: m.name,
        value: new Intl.NumberFormat('ko-KR', { maximumFractionDigits: m.digits }).format(v),
        change: fmtPct(pct, { unit: 'ratio', digits: 2 }),
        up: pct >= 0,
      }];
    });
    if (cards.length === 0) throw new Error('none');
    return { data: cards, isSample: false };
  } catch {
    return { data: SAMPLE_MARKETS, isSample: true };
  }
}

// ── 시장 레짐 (시장 화면 히어로 + 드라이버) — market_regime 최신행 ──
export type RegimeView = {
  label: string;
  score: number;
  markerPct: number; // 게이지 마커 위치(%) — score(-1..1) → 0..100
  pillKind: 'bad' | 'good' | 'warn';
  drivers: { text: string; kind: 'good' | 'bad' | 'neutral' }[];
};

export const SAMPLE_REGIME: RegimeView = {
  label: '방어 구간 · Risk-off',
  score: -0.5,
  markerPct: 25,
  pillKind: 'bad',
  drivers: [
    { text: '시장 20일 추세 −15.9%', kind: 'bad' },
    { text: '상승종목 비중 14%', kind: 'neutral' },
    { text: '외국인 5일 순매수', kind: 'good' },
  ],
};

export async function getMarketRegime(): Promise<Loaded<RegimeView>> {
  if (!hasSupabaseConfig) return { data: SAMPLE_REGIME, isSample: true };
  try {
    const { data } = await supabase
      .from('market_regime')
      .select('regime,score,drivers,date')
      .order('date', { ascending: false })
      .limit(1);
    const r = data?.[0] as { regime: string; score: number; drivers: string[] } | undefined;
    if (!r) throw new Error('none');
    const regime = r.regime ?? 'neutral';
    const score = Number(r.score ?? 0);
    const label =
      regime === 'risk_off' ? '방어 구간 · Risk-off'
      : regime === 'risk_on' ? '공격 구간 · Risk-on'
      : '중립 구간';
    const pillKind: RegimeView['pillKind'] =
      regime === 'risk_off' ? 'bad' : regime === 'risk_on' ? 'good' : 'warn';
    const markerPct = Math.max(2, Math.min(98, Math.round(((score + 1) / 2) * 100)));
    const drivers = ((r.drivers as string[]) ?? []).map((text) => {
      // 부호/키워드로 톤 추정 — 순매수=호재, '-'/순매도=악재, 그 외 중립.
      const kind: RegimeView['drivers'][number]['kind'] =
        /순매수/.test(text) && !/순매도/.test(text) ? 'good'
        : /[-−]/.test(text) || /순매도|하락|약세/.test(text) ? 'bad'
        : 'neutral';
      return { text, kind };
    });
    return { data: { label, score, markerPct, pillKind, drivers }, isSample: false };
  } catch {
    return { data: SAMPLE_REGIME, isSample: true };
  }
}

// ── 리포트 상세 (웹 getReportById 모바일판) — reports.payload 매핑 ──
type RepPayload = {
  plan?: {
    tp1?: number; stop_loss?: number; entry_price?: number; risk_reward?: number;
    style?: string; setup?: string; valid_until?: string;
  }[];
  verdict?: { score?: number; rating?: string };
  factor?: Record<string, number | null>;
  flows?: { foreign_net?: number; inst_net?: number; window_days?: number };
  narrative?: { thesis?: string; trader_view?: string; quant_view?: string; risks?: string[] };
  tradability?: { checks?: { key: string; label: string; passed: boolean }[] };
};

// 트레이드당 기본 리스크 1% → 권장 비중(=리스크÷손절거리비율, 0~25% 캡)
function positionWeightPct(entry: number | null, stop: number | null): string {
  if (entry == null || stop == null || entry <= 0) return '—';
  const dist = Math.abs(entry - stop) / entry;
  if (dist <= 0) return '—';
  return `${Math.max(0, Math.min(25, 1.0 / dist)).toFixed(1)}%`;
}

// 순매수 주수 → 부호 문자열 + 톤
function signedShares(n: number | null | undefined): { value: string; tone: 'good' | 'bad' } {
  const v = n ?? 0;
  const s = new Intl.NumberFormat('ko-KR').format(Math.abs(v));
  return { value: `${v >= 0 ? '+' : '−'}${s}주`, tone: v >= 0 ? 'good' : 'bad' };
}

const GATE_NAME: Record<string, string> = {
  active: '거래 활성',
  liquidity: '유동성',
  volatility: '변동성',
  backtest_gate: '백테스트 게이트',
};
const FACTOR_AXES: [string, string][] = [
  ['모멘텀', 'momentum_z'], ['가치', 'value_z'], ['성장', 'growth_z'],
  ['품질', 'quality_z'], ['저변동', 'lowvol_z'], ['사이즈', 'size_z'],
];

export async function getReportById(id: number): Promise<Loaded<ReportDetail>> {
  if (!hasSupabaseConfig || !Number.isFinite(id)) return { data: SAMPLE_REPORT, isSample: true };
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('id,as_of,rating,summary,payload,instruments(symbol,name,exchange)')
      .eq('id', id)
      .limit(1)
      .single();
    if (error || !data) throw error ?? new Error('not found');
    const inst = (data.instruments ?? {}) as unknown as { symbol?: string; name?: string; exchange?: string };
    const p = (data.payload ?? {}) as RepPayload;
    const plan0 = p.plan?.[0] ?? {};
    const entry = plan0.entry_price ?? null;
    const tp1 = plan0.tp1 ?? null;
    const stop = plan0.stop_loss ?? null;
    const styleLabel = STYLE_LABEL[plan0.style ?? ''] ?? plan0.style ?? '';
    const factor = p.factor ?? {};
    const narrative = p.narrative ?? {};
    const validUntil = plan0.valid_until ? String(plan0.valid_until).slice(0, 10) : null;

    const fn = signedShares(p.flows?.foreign_net);
    const inn = signedShares(p.flows?.inst_net);

    return {
      data: {
        meta: `발행 ${String(data.as_of).slice(0, 10)} · 인뎁스 리포트 · 수치는 전부 DB 근거(source_refs) — LLM은 서술만`,
        name: inst.name ?? '',
        code: inst.symbol ?? '',
        sub: `${inst.symbol ?? ''} · ${inst.exchange ?? ''}${styleLabel ? ` · ${styleLabel} 셋업` : ''}`,
        verdict: data.rating ?? p.verdict?.rating ?? '중립',
        score: p.verdict?.score != null ? Math.round(Number(p.verdict.score)) : 0,
        conclusion: narrative.thesis ?? data.summary ?? '',
        risk: Array.isArray(narrative.risks) ? narrative.risks.join(' ') : '',
        plan: {
          entry: fmtPrice(entry),
          target: fmtPrice(tp1),
          targetPct: changePct(entry, tp1),
          stop: fmtPrice(stop),
          stopPct: changePct(entry, stop),
          rr: plan0.risk_reward != null ? Number(plan0.risk_reward).toFixed(1) : riskReward(entry, tp1, stop),
          weight: positionWeightPct(entry, stop),
        },
        planNote: validUntil
          ? `플랜 유효: ${validUntil}까지 — 진입가 ±1% 이탈 시 무효. 비중은 회원 리스크 설정(트레이드당 1%)으로 재계산됩니다.`
          : '비중은 회원 리스크 설정(트레이드당 1%)으로 읽는 시점에 재계산됩니다.',
        gates: (p.tradability?.checks ?? []).map((c) => ({
          name: GATE_NAME[c.key] ?? c.key,
          sub: c.label,
          pass: c.passed,
        })),
        evidence: narrative.trader_view ?? narrative.quant_view ?? '',
        factors: FACTOR_AXES.flatMap(([name, k]) => {
          const z = factor[k];
          return z == null ? [] : [{ name, z: Math.round(Number(z) * 10) / 10 }];
        }),
        flow: [
          { label: '외국인', value: fn.value, tone: fn.tone },
          { label: '기관', value: inn.value, tone: inn.tone },
        ],
        source: `수치 출처: ohlcv · financials · flows · backtests — source_version 기록${p.flows?.window_days ? ` · 수급 ${p.flows.window_days}일` : ''}`,
        disclaimer: SAMPLE_REPORT.disclaimer,
      },
      isSample: false,
    };
  } catch {
    return { data: SAMPLE_REPORT, isSample: true };
  }
}

// ── 종목 상세 (instrument + 가격 + 5축 + 밸류 + 수급 + 플랜 + 리포트 요약) ──
// 종목 1개에 여러 테이블을 묶는 화면 — 종목 해석 후 병렬 조회.
function netStreak(vals: (number | null)[]): { days: number; dir: 1 | -1 | 0 } {
  let days = 0;
  let dir: 1 | -1 | 0 = 0;
  for (const v of vals) {
    if (v == null) break;
    const s: 1 | -1 | 0 = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (s === 0) break;
    if (dir === 0) dir = s;
    if (s !== dir) break;
    days++;
  }
  return { days, dir };
}
function streakCell(label: string, vals: (number | null)[]): { label: string; value: string; tone: 'good' | 'bad' } {
  const { days, dir } = netStreak(vals);
  if (dir === 0 || days === 0) return { label, value: '—', tone: 'bad' };
  return { label, value: `${dir > 0 ? '+' : '−'}${days}일`, tone: dir > 0 ? 'good' : 'bad' };
}

export async function getStockDetail(code: string): Promise<Loaded<StockDetail>> {
  if (!hasSupabaseConfig) return { data: getStock(code), isSample: true };
  try {
    const { data: inst } = await supabase
      .from('instruments')
      .select('id,symbol,name,exchange,sector')
      .eq('symbol', code)
      .limit(1)
      .single();
    if (!inst) throw new Error('no instrument');
    const iid = inst.id as number;

    const [priceRes, facRes, valRes, flowRes, sigRes, repRes] = await Promise.all([
      supabase.from('ohlcv').select('ts,close').eq('instrument_id', iid).eq('interval', '1d').order('ts', { ascending: false }).limit(2),
      supabase.from('factor_scores').select('value_z,momentum_z,growth_z,lowvol_z,composite_alpha').eq('instrument_id', iid).order('date', { ascending: false }).limit(1),
      supabase.from('valuations').select('per,pbr,roe,dcf_value,upside_pct').eq('instrument_id', iid).order('date', { ascending: false }).limit(1),
      supabase.from('flows').select('foreign_net,inst_net,date').eq('instrument_id', iid).order('date', { ascending: false }).limit(15),
      supabase.from('signals').select('style,setup,entry_price,stop_loss,tp1,risk_reward,strength').eq('instrument_id', iid).order('strength', { ascending: false }).limit(1),
      supabase.from('reports').select('id,rating,summary,payload').eq('instrument_id', iid).eq('report_type', 'indepth').eq('status', 'published').order('as_of', { ascending: false }).limit(1),
    ]);

    const priceRows = (priceRes.data ?? []) as { close: number }[];
    const close = priceRows[0]?.close != null ? Number(priceRows[0].close) : null;
    const prev = priceRows[1]?.close != null ? Number(priceRows[1].close) : null;
    const chg = close != null && prev != null && prev !== 0 ? (close - prev) / prev : null;

    const f = facRes.data?.[0] as FactorRow | undefined;
    const val = valRes.data?.[0] as Record<string, number | null> | undefined;
    const flows = (flowRes.data ?? []) as { foreign_net: number | null; inst_net: number | null }[];
    const sig = sigRes.data?.[0] as {
      style: string; setup: string; entry_price: number | null; stop_loss: number | null;
      tp1: number | null; risk_reward: number | null;
    } | undefined;
    const rep = repRes.data?.[0] as { id: number; rating: string | null; summary: string | null; payload: RepPayload | null } | undefined;
    const repScore = rep?.payload?.verdict?.score;

    const styleLabel = sig ? STYLE_LABEL[sig.style] ?? sig.style : '';
    const rating = rep?.rating ?? null;
    const verdict: StockDetail['verdict'] =
      rating === '매수' ? '매수'
      : rating === '거래 부적합' ? '관망'
      : rating === '중립' ? '중립'
      : (f?.composite_alpha ?? 0) > 0.3 ? '매수' : '중립';
    const score = repScore != null ? Math.round(Number(repScore)) : Math.round(50 + (f?.composite_alpha ?? 0) * 16.67);

    const valuation: StockDetail['valuation'] = [];
    if (val?.per != null) valuation.push({ label: 'PER', value: `${Number(val.per).toFixed(1)}배` });
    if (val?.pbr != null) valuation.push({ label: 'PBR', value: `${Number(val.pbr).toFixed(1)}배` });
    if (val?.dcf_value != null) valuation.push({ label: 'DCF 적정가', value: fmtPrice(Number(val.dcf_value)) });
    if (val?.upside_pct != null) {
      const u = Number(val.upside_pct);
      valuation.push({ label: '업사이드', value: fmtPct(u, { unit: 'ratio' }), tone: u >= 0 ? 'good' : 'bad' });
    }
    if (valuation.length === 0) valuation.push({ label: '밸류에이션', value: '데이터 없음' });

    const fStreak = streakCell('외국인', flows.map((x) => x.foreign_net));
    const iStreak = streakCell('기관', flows.map((x) => x.inst_net));
    const both = fStreak.tone === 'good' && iStreak.tone === 'good';
    const bothSell = fStreak.tone === 'bad' && iStreak.tone === 'bad' && fStreak.value !== '—' && iStreak.value !== '—';
    const flow: StockDetail['flow'] = [
      fStreak,
      iStreak,
      { label: '판정', value: both ? '동반 매집' : bothSell ? '동반 이탈' : '혼조', tone: both ? 'good' : 'bad' },
    ];

    const entry = sig?.entry_price ?? null;
    const tp1 = sig?.tp1 ?? null;
    const stop = sig?.stop_loss ?? null;
    const plan = {
      entry: fmtPrice(entry),
      target: fmtPrice(tp1),
      targetPct: changePct(entry, tp1),
      stop: fmtPrice(stop),
      stopPct: changePct(entry, stop),
      rr: sig?.risk_reward != null ? Number(sig.risk_reward).toFixed(1) : riskReward(entry, tp1, stop),
      weight: positionWeightPct(entry, stop),
    };

    return {
      data: {
        name: (inst.name as string) ?? code,
        code: (inst.symbol as string) ?? code,
        meta: `${inst.symbol} · ${inst.exchange}${styleLabel ? ` · ${styleLabel} 셋업` : ''}`,
        price: fmtPrice(close),
        change: chg != null ? `${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg * 100).toFixed(1)}% 오늘` : '—',
        changeUp: (chg ?? 0) >= 0,
        verdict,
        score,
        note: 'EOD 분석 · 팩터40 · 밸류30 · 시그널30',
        snowflake: snowflakeFromFactor(
          f ? { instrument_id: iid, value_z: f.value_z, momentum_z: f.momentum_z, growth_z: f.growth_z, lowvol_z: f.lowvol_z, composite_alpha: f.composite_alpha } : undefined,
        ),
        valuation,
        flow,
        plan,
        reportSummary: rep?.summary ?? rep?.payload?.narrative?.thesis ?? '발행된 리포트가 아직 없습니다.',
        reportId: rep?.id,
      },
      isSample: false,
    };
  } catch {
    return { data: getStock(code), isSample: true };
  }
}
