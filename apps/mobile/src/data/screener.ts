export const highlights = [
  { label: '오늘 신규 시그널', value: '12건', sub: '+5 vs 전일', accent: true, icon: 'bolt' as const },
  { label: '주도주 추세', value: '53건', sub: '최다 셋업', accent: false, icon: 'trending-up' as const },
  { label: '최고 합성알파', value: '+2.4σ', sub: '두산에너빌리티', accent: true, icon: 'show-chart' as const },
  { label: '평균 손익비', value: '2.1', sub: 'R:R 기준', accent: false, icon: 'balance' as const },
];

export const quickFilters = [
  { label: '진입 가능', icon: 'bolt' as const, active: true },
  { label: '수급', icon: 'trending-up' as const, active: false },
];

export const setupChips = [
  { label: '전체 76', active: true },
  { label: '주도주 53', active: false },
  { label: '수급 13', active: false },
  { label: '눌림목 6', active: false },
];

export const styleTabs = [
  { label: '스타일 전체', active: true },
  { label: '스윙', active: false },
  { label: '포지션', active: false },
];

export type Signal = {
  name: string;
  code: string;
  init: string;
  setup: string;
  style: string;
  entry: string;
  target: string;
  targetPct: string;
  stop: string;
  stopPct: string;
  rr: string;
  alpha: string;
  verdict: '매수' | '중립' | '관망';
  score: number;
};

export const signals: Signal[] = [
  { name: 'SK스퀘어', code: '402340', init: 'SK', setup: '52주 신고가', style: '포지션', entry: '158,000', target: '171,000', targetPct: '+8.2%', stop: '151,800', stopPct: '−3.9%', rr: '2.1', alpha: '+1.6σ', verdict: '매수', score: 72 },
  { name: 'SK하이닉스', code: '000660', init: 'SK', setup: '주도주 추세', style: '스윙', entry: '184,500', target: '203,000', targetPct: '+10.0%', stop: '174,300', stopPct: '−5.5%', rr: '1.8', alpha: '+1.9σ', verdict: '매수', score: 81 },
  { name: '티에스이', code: '131290', init: '티', setup: '수급 매집', style: '스윙', entry: '92,400', target: '104,000', targetPct: '+12.6%', stop: '86,700', stopPct: '−6.2%', rr: '2.0', alpha: '+1.4σ', verdict: '중립', score: 64 },
  { name: '한미반도체', code: '042700', init: '한', setup: '눌림목', style: '포지션', entry: '118,200', target: '132,000', targetPct: '+11.7%', stop: '110,500', stopPct: '−6.5%', rr: '1.8', alpha: '+1.2σ', verdict: '중립', score: 61 },
  { name: '두산에너빌리티', code: '034020', init: '두', setup: '주도주 추세', style: '포지션', entry: '21,350', target: '25,100', targetPct: '+17.6%', stop: '19,700', stopPct: '−7.7%', rr: '2.3', alpha: '+2.4σ', verdict: '매수', score: 76 },
];
