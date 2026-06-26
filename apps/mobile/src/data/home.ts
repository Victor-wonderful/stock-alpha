/**
 * 홈/대시보드 목업 데이터 — design/stock-alpha-ui.pen 의 홈 화면과 일치.
 * TODO(연동 단계): supabase 에서 recommendations/signals/factor_scores 조회로 대체.
 */

export const heroStat = {
  label: '진행중 픽 수익률',
  value: '+3.2%',
  positive: true,
  sub: '전체 발행 기준 · 삭제 없음',
  kpis: [
    { label: '오늘의 픽', value: '5종목', accent: false },
    { label: '발행 리포트', value: '100건', accent: false },
    { label: '검증 통과 전략', value: '7 / 10', accent: true },
  ],
};

export const markets = [
  { name: 'KOSPI', value: '2,718.43', change: '+0.84%', up: true },
  { name: 'S&P 500', value: '6,142.07', change: '+0.31%', up: true },
  { name: 'NASDAQ', value: '19,830.55', change: '-0.22%', up: false },
  { name: 'VIX', value: '13.82', change: '-2.10%', up: true },
];

export type FocusPick = {
  name: string;
  code: string;
  style: '스윙' | '데이' | '포지션';
  entry: string;
  tp: string;
  score: string;
};

export const focusPicks: FocusPick[] = [
  { name: 'SK스퀘어', code: '402340', style: '스윙', entry: '진입 158,000', tp: '+8.2%', score: '72' },
  { name: '티에스이', code: '131290', style: '데이', entry: '진입 92,400', tp: '+12.6%', score: '64' },
  { name: '신세계', code: '004170', style: '포지션', entry: '진입 152,000', tp: '+6.0%', score: '52' },
];

export type ReportRow = { name: string; line: string; score: string; tone: 'good' | 'warn' };

export const reports: ReportRow[] = [
  { name: 'SK하이닉스', line: 'HBM 수주 모멘텀 지속 — 눌림목 진입 구간', score: '91', tone: 'good' },
  { name: '삼성전자', line: '업황 회복 신호 유효, 밸류 부담 — 분할 접근', score: '74', tone: 'warn' },
  { name: '엘티씨', line: '변동성 수축 후 거래량 동반 돌파 임박', score: '68', tone: 'warn' },
];

export const verdictDist = {
  buy: { label: '매수', count: 12 },
  neutral: { label: '중립', count: 38 },
  watch: { label: '관망', count: 50 },
};

export const trackRecord = {
  sub: '전체 발행 기준 · 삭제 없음',
  cells: [
    { label: '누적 발행', value: '47건', tone: 'plain' as const },
    { label: '목표 달성', value: '18건 (38%)', tone: 'good' as const },
    { label: '손절', value: '9건 (19%)', tone: 'bad' as const },
    { label: '진행중', value: '7건', tone: 'plain' as const },
  ],
  avg: '+4.1%',
};

export type Gate = { name: string; ev?: string; status: string; pass: boolean };

export const gates: Gate[] = [
  { name: '52주 신고가', ev: '+0.249R', status: 'PASS', pass: true },
  { name: '변동성 수축 돌파', ev: '+0.31R', status: 'PASS', pass: true },
  { name: '주도주 추세', ev: '+0.22R', status: 'PASS', pass: true },
  { name: '돌파', ev: '+0.18R', status: 'PASS', pass: true },
  { name: '눌림목', status: '대기', pass: false },
  { name: '실적 모멘텀 (PEAD)', status: '검증 중', pass: false },
];
