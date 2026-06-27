export type Gate = { name: string; sub: string; pass: boolean };
export type Factor = { name: string; z: number };
export type ReportFlow = { label: string; value: string; tone: 'good' | 'bad' };
export type ReportPlan = {
  entry: string; target: string; targetPct: string;
  stop: string; stopPct: string; rr: string; weight: string;
};
export type ReportDetail = {
  meta: string; name: string; code: string; sub: string;
  verdict: string; score: number; conclusion: string; risk: string;
  plan: ReportPlan; planNote: string;
  gates: Gate[]; evidence: string; factors: Factor[];
  flow: ReportFlow[]; source: string; disclaimer: string;
};

export const report: ReportDetail = {
  meta: '발행 2026-06-25 16:30 KST · 인뎁스 리포트 · 수치는 전부 DB 근거(source_refs) — LLM은 서술만',
  name: '한성크린텍',
  code: '066980',
  sub: '066980 · KOSPI · 포지션 셋업',
  verdict: '매수',
  score: 71,
  conclusion:
    '52주 신고가를 거래대금 동반으로 경신했고 외국인·기관이 9일째 동반 순매수 중입니다. 검증된 셋업(기대값 +0.249R) 트리거가 살아 있어 계획된 가격에서의 진입은 유효합니다 — 다만 시장이 위험 회피 국면이므로 권장 비중을 넘기지 않는 것이 전제입니다.',
  risk: '최우선 리스크 — 위험 회피 레짐에서 신고가 추격은 되돌림에 취약. 진입가 이탈 추격 매수 금지, 손절 −10% 엄수.',
  plan: { entry: '11,340', target: '13,592', targetPct: '+20%', stop: '10,188', stopPct: '−10%', rr: '2.0', weight: '9.8%' },
  planNote:
    '플랜 유효: 6/26(금) 장중 — 진입가 ±1% 이탈 시 무효. 비중은 회원 리스크 설정(트레이드당 1%)으로 읽는 시점에 재계산됩니다.',
  gates: [
    { name: '거래 활성', sub: '정상 거래 종목 · 관리종목 아님', pass: true },
    { name: '유동성', sub: '20일 평균 거래대금 기준 충족', pass: true },
    { name: '변동성', sub: 'ATR 적정 범위 · 갭 리스크 낮음', pass: true },
    { name: '백테스트 게이트', sub: '52주 신고가 셋업 검증 통과 · 기대값 +0.249R', pass: true },
  ],
  evidence:
    '6/25 종가 기준 52주 신고가(11,120원)를 거래대금 동반으로 돌파했으며, 돌파일 거래대금은 20일 평균 대비 2.4배입니다. 직전 6주간 변동성 수축(밴드 폭 백분위 8%) 후의 확장 국면으로, 돌파 실패 시 되돌림 목표는 손절선과 정합합니다.',
  factors: [
    { name: '모멘텀', z: 1.6 },
    { name: '수급', z: 1.9 },
    { name: '가치', z: 0.8 },
    { name: '성장', z: 0.7 },
    { name: '품질', z: 0.5 },
    { name: '저변동', z: -0.3 },
  ] as Factor[],
  flow: [
    { label: '외국인', value: '+1,840억', tone: 'good' as const },
    { label: '기관', value: '+620억', tone: 'good' as const },
    { label: '개인', value: '−2,410억', tone: 'bad' as const },
  ],
  source: '수치 출처: ohlcv · financials(2025FY) · flows · backtests — source_version 기록',
  disclaimer:
    '본 리포트는 투자 참고 자료이며 투자 권유가 아닙니다. 투자 판단과 결과의 책임은 투자자 본인에게 있습니다. 과거 성과(백테스트 포함)는 미래 수익을 보장하지 않습니다. — 유사투자자문업 신고 제0000호',
};
