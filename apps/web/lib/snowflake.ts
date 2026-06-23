// ③ 종목 — Stock-Alpha 스노우플레이크 5축 산식 (IA 확정 2026-06-23, docs/PLAN.md).
// 엔진 데이터(밸류·팩터·수급·리스크)를 0~100으로 점수화. 신규 수집 없음 — 상세 페이지가
// 이미 로드하는 값을 점수화·시각화만 한다. 수급 축은 둘 다 가진 경쟁사가 없는 차별점.
import type { ValuationView, FactorView, FlowRowView, RiskView } from "./types";

export interface SnowflakeAxis {
  key: "value" | "flow" | "momentum" | "growth" | "stability";
  label: string;
  score: number; // 0~100
}
export interface SnowflakeResult {
  axes: SnowflakeAxis[]; // 5축 (value, flow, momentum, growth, stability 순)
  health: number; // 1~5
  overall: number; // 0~100
  summary: string; // 토스식 한 줄
  tips: { tone: "good" | "warn" | "bad"; text: string }[]; // ProTips 3~5줄
}

const clamp = (x: number, lo = 5, hi = 95) => Math.max(lo, Math.min(hi, x));
// 섹터중립 z-score(대략 -3~+3) → 0~100. z=+3→95, z=-3→5.
const zTo100 = (z: number | null | undefined) =>
  z == null ? null : clamp(50 + z * 16.67);
// 사용 가능한 신호만 평균. 전부 없으면 중립 50.
const blend = (parts: (number | null)[]): number => {
  const v = parts.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 50;
};

const LABEL: Record<SnowflakeAxis["key"], string> = {
  value: "밸류",
  flow: "수급",
  momentum: "모멘텀",
  growth: "성장",
  stability: "안정성",
};
const PHRASE: Record<SnowflakeAxis["key"], string> = {
  value: "저평가 매력",
  flow: "수급(외인·기관)",
  momentum: "추세",
  growth: "실적 성장",
  stability: "안정성",
};

export function computeSnowflake(args: {
  val: ValuationView | null;
  fac: FactorView | null;
  flows: FlowRowView[];
  risk: RiskView | null;
}): SnowflakeResult {
  const { val, fac, flows, risk } = args;

  // 밸류 — DCF 상승여력 + value 팩터. upside_pct 는 분수(0.21 = +21%).
  const upsideScore = val?.upside_pct != null ? clamp(50 + val.upside_pct * 100) : null;
  const value = blend([zTo100(fac?.value_z), upsideScore]);

  // 수급 — 외인+기관 순매수의 매수세 비중(%). 둘 다 가진 경쟁사 없는 차별 축.
  const smart = flows.map((f) => (f.foreign_net ?? 0) + (f.inst_net ?? 0));
  let pos = 0,
    neg = 0;
  for (const s of smart) s >= 0 ? (pos += s) : (neg += -s);
  const flow = pos + neg > 0 ? clamp((100 * pos) / (pos + neg)) : 50;

  // 모멘텀 — momentum 팩터.
  const momentum = blend([zTo100(fac?.momentum_z)]);

  // 성장 — growth 팩터 + ROE(분수, 0.15=15%). 10%→50, 35%→95.
  const roeScore = val?.roe != null ? clamp(50 + (val.roe - 0.1) * 200) : null;
  const growth = blend([zTo100(fac?.growth_z), roeScore]);

  // 안정성 — lowvol 팩터 + (낮은 변동성·얕은 MDD). mdd 는 음수.
  const volScore = risk?.vol_annual != null ? clamp(100 - risk.vol_annual * 200) : null;
  const mddScore = risk?.max_drawdown != null ? clamp(100 + risk.max_drawdown * 200) : null;
  const stability = blend([zTo100(fac?.lowvol_z), volScore, mddScore]);

  const axes: SnowflakeAxis[] = [
    { key: "value", label: LABEL.value, score: Math.round(value) },
    { key: "flow", label: LABEL.flow, score: Math.round(flow) },
    { key: "momentum", label: LABEL.momentum, score: Math.round(momentum) },
    { key: "growth", label: LABEL.growth, score: Math.round(growth) },
    { key: "stability", label: LABEL.stability, score: Math.round(stability) },
  ];

  const overall = Math.round(axes.reduce((a, b) => a + b.score, 0) / axes.length);
  const health = Math.max(1, Math.min(5, Math.round(overall / 20)));

  // 토스식 한 줄 — 최고/최저 축으로 구성. 수급이 펀더멘털을 교정한다.
  const sorted = [...axes].sort((a, b) => b.score - a.score);
  const hi = sorted[0],
    lo = sorted[sorted.length - 1];
  const flowAxis = axes.find((a) => a.key === "flow")!;
  let summary = `${PHRASE[hi.key]}이 가장 강하고(${hi.score}), ${PHRASE[lo.key]}이 가장 약합니다(${lo.score}).`;
  if (flowAxis.score < 45 && hi.key === "value")
    summary = `저평가 매력은 높지만(${axes[0].score}) 외국인·기관 수급이 빠지는 중(${flowAxis.score}) — 지금은 관망, 수급 반전 확인 후 진입 검토.`;
  else if (flowAxis.score < 45)
    summary += " 수급이 받쳐주지 않아 진입은 신중히.";
  else if (overall >= 65) summary += " 전반적으로 양호 — 진입 검토 대상.";

  // ProTips — 코드 산출 수치(환각 차단). 최대 5줄.
  const tips: SnowflakeResult["tips"] = [];
  if (val?.upside_pct != null)
    tips.push({
      tone: val.upside_pct >= 0 ? "good" : "bad",
      text: `DCF 적정가 대비 ${val.upside_pct >= 0 ? "상승여력" : "고평가"} ${Math.abs(val.upside_pct * 100).toFixed(0)}%`,
    });
  if (val?.per != null)
    tips.push({
      tone: val.per > 0 && val.per < 12 ? "good" : "warn",
      text: `PER ${val.per.toFixed(1)}배${val.per > 0 && val.per < 12 ? " — 저평가 구간" : ""}`,
    });
  if (val?.roe != null)
    tips.push({
      tone: val.roe >= 0.1 ? "good" : "warn",
      text: `ROE ${(val.roe * 100).toFixed(0)}%`,
    });
  const fSum = flows.reduce((s, f) => s + (f.foreign_net ?? 0), 0);
  if (flows.length > 0)
    tips.push({
      tone: fSum >= 0 ? "good" : "bad",
      text: `외국인 ${flows.length}일 누적 ${fSum >= 0 ? "순매수" : "순매도"}`,
    });
  if (risk?.max_drawdown != null)
    tips.push({
      tone: risk.max_drawdown > -0.3 ? "good" : "warn",
      text: `최대낙폭 ${(risk.max_drawdown * 100).toFixed(0)}%`,
    });

  return { axes, health, overall, summary, tips: tips.slice(0, 5) };
}
