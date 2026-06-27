// DB(Supabase) → 모바일 화면 shape 매핑 레이어.
// 웹 apps/web/lib/data.ts 의 쿼리를 모바일 anon 클라이언트로 옮긴 것.
// 모든 함수는 Loaded<T> 를 반환하고, 미설정/실패 시 목업으로 폴백(isSample=true).
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { changePct, fmtPrice, riskReward, fmtPct } from '@/lib/format';
import type { Loaded } from '@/lib/use-query';
import type { PickData, PickBadge } from '@/components/pick-card';
import { picks as SAMPLE_PICKS } from '@/data/recommend';
import { focusPicks as SAMPLE_FOCUS, type FocusPick } from '@/data/home';

// trade_style enum → 한국어 라벨 (signals/recommendations.style)
const STYLE_LABEL: Record<string, string> = {
  scalping: '스캘핑',
  day: '데이',
  swing: '스윙',
  position: '포지션',
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
