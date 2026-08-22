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
// 다음 거래일 '후보' 라벨. ⚠️ 주말만 건너뛴다 — 공휴일은 모른다.
// 실측(단일 종목 일봉 역산): 최근 반년에 평일 휴장이 11일 있었다
// (설날 2/16~18, 삼일절 대체 3/2, 근로자의날 5/1, 어린이날 5/5, 석가탄신일 5/25 등).
// 즉 공휴일 직전 분석일에는 이 함수가 휴장일을 가리킨다.
// 특히 광복절(8/15)이 토요일이면 대체공휴일이 월요일이라 8/17 이 휴장이 된다.
//
// 거래일 캘린더가 DB 에 없어 여기서 확정할 수 없다. 그래서 호출부는 이 값을
// 단독으로 쓰지 말고 nextTradingDayIsCertain() 으로 확실한지 먼저 물어야 한다.
export function nextTradingDayLabel(asOf: string): string {
  const [y, m, dd] = asOf.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WEEKDAYS[d.getUTCDay()]})`;
}

// 위 라벨을 '단정해도 되는가'. 계산한 다음 거래일 후보와 분석일 사이에 법정공휴일이
// 낄 수 있으면 false. 공휴일 표가 없으므로 보수적으로 판단한다:
// 분석일 다음 날부터 후보일까지 구간에 한국 법정공휴일(고정일)이 하나라도 걸리거나,
// 그 공휴일이 주말이라 대체공휴일이 발생할 수 있으면 단정하지 않는다.
const FIXED_HOLIDAYS_MMDD = [
  "01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25",
];
export function nextTradingDayIsCertain(asOf: string): boolean {
  return tradingWindowIsCertain(asOf, 5);
}

/** from 다음 날부터 daysAhead 일 안에 고정 공휴일이 하나도 없는가.
 *
 * 있으면 «단정하지 않는다» — 음력 명절(설·추석)은 여기 없으므로 이 검사를 통과해도
 * 100% 는 아니다. 그래서 이건 **DB 휴장일 표가 그 구간을 못 덮을 때만 쓰는 폴백**이고,
 * 호출부는 DB(getNthTradingDay)를 먼저 물어야 한다.
 */
export function tradingWindowIsCertain(asOf: string, daysAhead: number): boolean {
  const [y, m, dd] = asOf.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, dd));
  // 대체공휴일 여파까지 보려면 창 끝에서 며칠 더 살핀다.
  for (let i = 1; i <= daysAhead + 3; i++) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate(),
    ).padStart(2, "0")}`;
    if (FIXED_HOLIDAYS_MMDD.includes(mmdd)) return false;
  }
  return true;
}

/** asOf 다음 N번째 «거래일» 라벨 — ⚠️ 주말만 건너뛴다(공휴일 모름).
 *
 * 반드시 tradingWindowIsCertain 으로 먼저 물어보고 쓸 것. 청산 기한처럼 2~4주 앞을
 * 가리키는 값은 창이 길어 공휴일이 낄 확률도 그만큼 높다.
 */
export function nthTradingDayLabel(asOf: string, n: number): string {
  const [y, m, dd] = asOf.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  let seen = 0;
  while (seen < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) seen += 1;
  }
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WEEKDAYS[d.getUTCDay()]})`;
}
