// 표시용 포매터 — apps/web/lib/format.ts 와 동일 규칙 (모바일 복제).
// DB는 숫자를 저장하고, 화면은 문자열을 쓰므로 매핑 시점에 여기서 변환한다.

export function fmtPrice(v: number | null | undefined, currency = 'KRW'): string {
  if (v == null) return '—';
  const digits = currency === 'KRW' ? 0 : 2;
  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(v);
}

// 비율(0.0~1.0 또는 % 단위)을 받아 부호 포함 % 문자열로. mode 로 입력 단위 지정.
export function fmtPct(
  v: number | null | undefined,
  { digits = 1, unit = 'ratio' }: { digits?: number; unit?: 'ratio' | 'percent' } = {},
): string {
  if (v == null) return '—';
  const pct = unit === 'ratio' ? v * 100 : v;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

// 진입가→목표가/손절가 변화율(%) — 부호 포함 문자열. (DB엔 가격만 있고 화면은 %도 표시)
export function changePct(from: number | null | undefined, to: number | null | undefined): string {
  if (from == null || to == null || from === 0) return '—';
  return fmtPct((to - from) / from, { unit: 'ratio' });
}

// 손익비 R = (목표-진입)/(진입-손절). 음수/0 분모는 null.
export function riskReward(
  entry: number | null | undefined,
  target: number | null | undefined,
  stop: number | null | undefined,
): string {
  if (entry == null || target == null || stop == null) return '—';
  const risk = entry - stop;
  if (risk <= 0) return '—';
  return ((target - entry) / risk).toFixed(1);
}

// 신뢰도(0~1) → 0~100 정수
export function strengthPct(v: number | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Math.max(0, Math.min(1, v)) * 100);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(d);
}
