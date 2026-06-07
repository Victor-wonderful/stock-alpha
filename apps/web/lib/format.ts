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
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
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
