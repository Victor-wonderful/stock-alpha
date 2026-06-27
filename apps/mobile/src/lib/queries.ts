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
  reports as SAMPLE_REPORTS,
  type FocusPick,
  type ReportRow,
} from '@/data/home';
import { signals as SAMPLE_SIGNALS, type Signal } from '@/data/screener';

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
