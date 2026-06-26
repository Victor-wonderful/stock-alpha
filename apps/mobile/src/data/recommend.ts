import type { PickData } from '@/components/pick-card';

export const recommendMeta = {
  subtitle: '시스템이 엄선한 오늘의 픽 · 사람이 고르지 않습니다',
  regimePill: '하락추세',
  band: {
    title: '지금 시장: 하락추세',
    detail: '추세 추종 추천은 억제하고, 수급·역추세 셋업 위주로 발행합니다.',
  },
  push: {
    title: '한성크린텍 진입가 11,340 도달',
    body: '지금이 진입 타이밍이에요. 목표 13,592 / 손절 10,188',
  },
};

export type PipelineStep = {
  n: string;
  title: string;
  desc: string;
  tag: string;
  tagKind: 'bad' | 'good' | 'accent';
  accent?: boolean;
};

export const pipeline: PipelineStep[] = [
  {
    n: '1',
    title: '시장 국면 판정',
    desc: '방향·추세강도 2축으로 상승·하락·횡보를 구분',
    tag: '지금 · 하락추세',
    tagKind: 'bad',
  },
  {
    n: '2',
    title: '검증 전략 라우팅',
    desc: '국면에 맞는 백테스트 통과 셋업만 — 칼만·수급·역추세 등',
    tag: '수급·역추세 ON',
    tagKind: 'good',
  },
  {
    n: '3',
    title: '점수순 픽',
    desc: '팩터40·밸류30·시그널30 → 상위 5 · 섹터 2종 상한',
    tag: '미달이면 빈 날',
    tagKind: 'accent',
    accent: true,
  },
];

export const picks: PickData[] = [
  {
    name: '한성크린텍',
    code: '066980',
    hl: true,
    status: { text: '지금 진입 타이밍', kind: 'now' },
    badges: [
      { text: '포지션 · 수주~수개월', kind: 'neutral' },
      { text: '큰손 매수', kind: 'good' },
      { text: '검증', kind: 'good' },
    ],
    reason: '외국인·기관이 9일째 매집 — 방금 추천 진입가에 도달했어요.',
    entry: '11,340',
    target: '13,592',
    targetPct: '+20%',
    stop: '10,188',
    stopPct: '−10%',
    rr: '2.0',
    weight: '9.8%',
    score: 71,
    snowflake: { scores: [82, 90, 60, 68, 55], health: 74, score: 71 },
  },
  {
    name: '테크윙',
    code: '089030',
    status: { text: '진입 대기', kind: 'wait' },
    badges: [
      { text: '스윙 · 돌파', kind: 'neutral' },
      { text: '거래량 급증', kind: 'good' },
      { text: '검증', kind: 'good' },
    ],
    reason: '변동성 수축 후 거래량 동반 — 돌파 임박, 트리거 도달을 기다립니다.',
    entry: '38,200',
    target: '44,600',
    targetPct: '+16.8%',
    stop: '35,100',
    stopPct: '−8.1%',
    rr: '2.1',
    weight: '6%',
    score: 68,
    snowflake: { scores: [58, 72, 80, 74, 50], health: 66, score: 68 },
  },
];
