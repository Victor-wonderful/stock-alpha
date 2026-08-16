// 공시 유형 표기와 '성적표' 해석.
//
// 지금까지 화면은 공시를 호재/중립/악재로 나눠 보여줬다. 그 분류는 **추측**이다 —
// 엔진의 disclosure_class.py 가 보고서 이름을 보고 "이건 좋은 소식일 것"이라고 가설을
// 붙인 값이고, 실제로 주가가 어떻게 됐는지는 아무도 안 세어봤다.
//
// 세어보니 어긋났다(2026-08-16, 공시 2,845건 / 2개월):
//   공급계약은 '호재'로 분류돼 있는데 한 달 뒤 -3.2%, 10번 중 4번만 성공했다.
//   개인 투자자가 가장 많이 사는 뉴스가 성적은 가장 나빴다.
// 그래서 이제 화면은 추측(direction)이 아니라 실측(event_evidence)을 함께 보여준다.

export const EVENT_LABEL: Record<string, string> = {
  supply_contract: "공급계약",
  rights_offering: "유상증자",
  convertible_bond: "전환사채 발행",
  buyback: "자사주 매입",
  dividend: "배당",
  control_change: "최대주주 변경",
  merger_split: "합병·분할",
  unusual_inquiry: "조회공시 요구",
  delisting_risk: "상장폐지 위험",
  equity_invest: "타법인 출자",
  trading_halt: "거래정지",
  trading_resume: "거래재개",
  buyback_cancel_trust: "자사주 신탁해지",
  capital_reduction: "감자",
  asset_acquire: "자산 양수",
  asset_dispose: "자산 양도",
  bonus_issue: "무상증자",
  bond_with_warrant: "신주인수권부사채",
  exchangeable_bond: "교환사채",
  embezzlement: "횡령·배임",
  distress: "재무 위험",
  lawsuit: "소송",
  audit_opinion: "감사의견",
};

export type EventEvidence = {
  eventType: string;
  n: number;
  car1d: number | null;
  car5d: number | null;
  car20d: number | null;
  win20d: number | null;
  verdict: "good" | "caution" | "neutral" | "insufficient";
};

export const VERDICT_LABEL: Record<EventEvidence["verdict"], string> = {
  good: "좋음",
  caution: "조심",
  neutral: "보통",
  insufficient: "판단 보류",
};

// 색은 판정에만 쓴다. '판단 보류'는 회색이어야 한다 — 모르는 것에 색을 주면
// 아는 것처럼 읽힌다.
export const VERDICT_CLASS: Record<EventEvidence["verdict"], string> = {
  good: "bg-good-soft text-good",
  caution: "bg-bad-soft text-bad",
  neutral: "bg-surface-2 text-text-dim",
  insufficient: "bg-surface-2 text-text-mute",
};

// 사람 말 한 줄. 퍼센트를 그대로 던지지 않고 "10번 중 몇 번"으로 옮긴다 —
// 승률 43% 보다 "10번 중 4번"이 훨씬 빨리 읽힌다.
export function evidenceSentence(e: EventEvidence | undefined): string | null {
  if (!e) return null;
  if (e.verdict === "insufficient") {
    return `아직 ${e.n}건뿐이라 판단하지 않습니다.`;
  }
  if (e.car20d == null || e.win20d == null) return null;
  const pct = Math.abs(e.car20d * 100).toFixed(1);
  const outOf10 = Math.round(e.win20d * 10);
  const dir = e.car20d >= 0 ? "올랐습니다" : "떨어졌습니다";
  return `과거 ${e.n}번 중 10번에 ${outOf10}번 성공 · 한 달 뒤 평균 ${pct}% ${dir}.`;
}

// 추측(direction)과 실측(verdict)이 어긋나는가 — 어긋날 때가 가장 알려줄 값이 크다.
export function contradictsDirection(
  direction: string | null,
  verdict: EventEvidence["verdict"] | undefined,
): boolean {
  if (!verdict || verdict === "insufficient" || verdict === "neutral") return false;
  return (
    (direction === "positive" && verdict === "caution") ||
    (direction === "negative" && verdict === "good")
  );
}
