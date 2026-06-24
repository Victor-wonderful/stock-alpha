// 셋업 → "성격" 매핑 — 추천 카드가 "왜 떴나"를 한눈에(알파 노하우 ③ 수급 교정·다양성).
// 사용자 언어로: 큰손/추세/반등/합의/종합. 전 셋업이 게이트 통과분이라 별도로 🛡 검증 배지.

export type SetupTone = "flow" | "trend" | "reversal" | "consensus" | "value";
export interface SetupCharacter {
  icon: string;
  label: string;
  tone: SetupTone;
}

const MAP: Record<string, SetupCharacter> = {
  // 🏦 수급 — 외인·기관 매집 (전 국면 허용, 알파 차별 축)
  flow_accumulation: { icon: "🏦", label: "큰손 매수", tone: "flow" },
  // 🤝 합의 — 다중 셋업 동시 신호 (고확신)
  ensemble: { icon: "🤝", label: "다중 합의", tone: "consensus" },
  // 🔄 반등·평균회귀 (역추세 — 하락장/횡보)
  oversold_bounce: { icon: "🔄", label: "과대낙폭 반등", tone: "reversal" },
  double_bottom: { icon: "🔄", label: "쌍바닥 반등", tone: "reversal" },
  sigma: { icon: "🔄", label: "평균회귀", tone: "reversal" },
  quantile: { icon: "🔄", label: "과매도 반등", tone: "reversal" },
  // 💎 종합 우량
  factor_composite: { icon: "💎", label: "종합 우량", tone: "value" },
  // 📈 추세·모멘텀·돌파
  leader_trend: { icon: "📈", label: "주도주 추세", tone: "trend" },
  high_52w: { icon: "📈", label: "신고가 추세", tone: "trend" },
  breakout: { icon: "🚀", label: "돌파", tone: "trend" },
  vol_squeeze: { icon: "🚀", label: "변동성 돌파", tone: "trend" },
  pullback: { icon: "📈", label: "눌림목", tone: "trend" },
  pivot: { icon: "🚀", label: "피봇 돌파", tone: "trend" },
  kalman: { icon: "📈", label: "칼만 추세", tone: "trend" },
  median: { icon: "📈", label: "추세", tone: "trend" },
  markov: { icon: "📈", label: "추세 레짐", tone: "trend" },
  delta: { icon: "📈", label: "모멘텀", tone: "trend" },
  sortino: { icon: "📈", label: "안정 모멘텀", tone: "trend" },
  bayes: { icon: "📈", label: "추세 결합", tone: "trend" },
};

export function setupCharacter(setup: string | null | undefined): SetupCharacter {
  return (setup && MAP[setup]) || { icon: "📈", label: "추세", tone: "trend" };
}

// 성격별 배지 색 — 다크 테마 토큰(앱 클래스).
export const TONE_CLASS: Record<SetupTone, string> = {
  flow: "bg-accent/15 text-accent",
  trend: "bg-sky-500/15 text-sky-300",
  reversal: "bg-warn-soft text-warn",
  consensus: "bg-violet-500/15 text-violet-300",
  value: "bg-good-soft text-good",
};
