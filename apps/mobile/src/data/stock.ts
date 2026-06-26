import type { Snowflake5Data } from '@/components/snowflake';

export type StockDetail = {
  name: string;
  code: string;
  meta: string;
  price: string;
  change: string;
  changeUp: boolean;
  verdict: '매수' | '중립' | '관망';
  score: number;
  note: string;
  snowflake: Snowflake5Data;
  valuation: { label: string; value: string; tone?: 'good' | 'bad' }[];
  flow: { label: string; value: string; tone: 'good' | 'bad' }[];
  plan: { entry: string; target: string; targetPct: string; stop: string; stopPct: string; rr: string; weight: string };
  reportSummary: string;
};

/** 코드별 상세. 데모용으로 한성크린텍만 채우고 기본값 fallback. */
const HANSUNG: StockDetail = {
  name: '한성크린텍',
  code: '066980',
  meta: '066980 · KOSPI · 포지션 셋업',
  price: '11,340',
  change: '▲ 2.1% 오늘',
  changeUp: true,
  verdict: '매수',
  score: 71,
  note: 'EOD 분석 완료 · 팩터40 · 밸류30 · 시그널30',
  snowflake: { scores: [82, 90, 60, 68, 55], health: 74, score: 71 },
  valuation: [
    { label: 'PER', value: '12.3배' },
    { label: 'PBR', value: '1.8배' },
    { label: 'DCF 적정가', value: '14,200' },
    { label: '업사이드', value: '+25%', tone: 'good' },
  ],
  flow: [
    { label: '외국인', value: '+9일', tone: 'good' },
    { label: '기관', value: '+6일', tone: 'good' },
    { label: '개인', value: '−5일', tone: 'bad' },
    { label: '판정', value: '동반 매집', tone: 'good' },
  ],
  plan: { entry: '11,340', target: '13,592', targetPct: '+20%', stop: '10,188', stopPct: '−10%', rr: '2.0', weight: '9.8%' },
  reportSummary:
    'HBM 수주 모멘텀 지속 — 눌림목 진입 구간. 외국인·기관 동반 매집으로 수급 우위, 밸류에이션도 적정가 대비 25% 업사이드.',
};

export function getStock(code?: string): StockDetail {
  if (code && code !== HANSUNG.code) {
    return { ...HANSUNG, name: `종목 ${code}`, code, meta: `${code} · KOSPI` };
  }
  return HANSUNG;
}
