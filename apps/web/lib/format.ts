// 표시용 포매터

export function fmtPrice(v: number | null | undefined, currency = "KRW"): string {
  if (v == null) return "—";
  const digits = currency === "KRW" ? 0 : 2;
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(v);
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  // 부호 판정을 반올림 '뒤'에 한다. 먼저 하면 -0.0002 가 "-0.0%" 로 찍혀
  // 홈 대표 KPI('진행중 픽 수익률')에 마이너스 0 이 뜬다 — 고장으로 읽힌다.
  const pct = Number((v * 100).toFixed(digits));
  const shown = pct === 0 ? 0 : pct; // -0 을 0 으로 정규화
  return `${shown > 0 ? "+" : ""}${shown.toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// 신뢰도(0~1) → 0~100 정수
export function strengthPct(v: number | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Math.max(0, Math.min(1, v)) * 100);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 분석 기준일(종가일) 라벨 — "7월 31일(금)"
export function tradingDayLabel(asOf: string): string {
  const [y, m, dd] = asOf.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return `${m}월 ${dd}일(${WEEKDAYS[wd]})`;
}

// 다음 거래일 라벨 — 픽은 '종가 분석 → 다음 거래일 장전 플랜'이라 대상일 표기에 쓴다.
// 공휴일은 반영하지 않는다(주말만 건너뜀) — 라벨 용도라 하루 어긋나도 치명적이지 않다.
export function nextTradingDayLabel(asOf: string): string {
  const [y, m, dd] = asOf.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WEEKDAYS[d.getUTCDay()]})`;
}
