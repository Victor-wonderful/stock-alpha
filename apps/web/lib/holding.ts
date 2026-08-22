// ── 보유기간·매매 계획 ──────────────────────────────────────────────────────
//
// "오늘 사면 오늘 파는 건가, 며칠 들고 가는 건가" — 화면이 이 질문에 답해야 한다.
//
// 2026-08-22 부터 보유기간은 «스타일»(swing/position)이 아니라 **기간**(단기·중기·장기)이
// 정한다. 스타일 배정은 셋업을 만들 때 손으로 적은 값이라 검증된 적이 없었고, 실제로
// 재보니 셋업마다 맞는 기간이 달랐다 — 과매도 반등은 단기 +0.43 인데 장기 -0.30 으로,
// 오래 들면 벌었던 걸 다 토해낸다.
//
// ⚠️ 아래 숫자는 엔진의 단일 출처를 **복제**한 것이다:
//     apps/engine/engine/signals/horizons.py
// 엔진에서 바꾸면 여기도 바꿔야 한다.

export type Horizon = "short" | "mid" | "long";

export interface HorizonSpec {
  key: Horizon;
  label: string;
  bars: number;
  approx: string;
  /** 진입 방식 — 중장기는 나눠 산다(하락 분할). */
  entry: string;
  /** 진입을 나누는가 (화면에서 «분할 매수» 표기를 띄울지) */
  scaleIn: boolean;
}

export const HORIZONS: HorizonSpec[] = [
  {
    key: "short",
    label: "단기",
    bars: 5,
    approx: "약 1주",
    entry: "다음 거래일 시가에 전량 매수",
    scaleIn: false,
  },
  {
    key: "mid",
    label: "중기",
    bars: 10,
    approx: "약 2주",
    entry: "다음 거래일 시가 50% · −1×ATR 50%",
    scaleIn: true,
  },
  {
    key: "long",
    label: "장기",
    bars: 20,
    approx: "약 1개월",
    entry: "다음 거래일 시가 40% · −1×ATR 40% · −2×ATR 20%",
    scaleIn: true,
  },
];

const BY_KEY = new Map(HORIZONS.map((h) => [h.key as string, h]));

/** 기간 도입 전 픽·시그널만 쓰는 폴백. 스타일이 보유기간을 정하던 시절의 값. */
const LEGACY_STYLE_BARS: Record<string, number> = {
  scalping: 1,
  day: 1,
  swing: 10,
  position: 60,
};

export function horizonSpec(horizon: string | null | undefined): HorizonSpec | null {
  return (horizon && BY_KEY.get(horizon)) || null;
}

/** "최대 5거래일" — 좁은 자리에 쓰는 한 조각. */
export function holdingLabel(
  horizon: string | null | undefined,
  style?: string | null,
): string {
  const h = horizonSpec(horizon);
  if (h) return `최대 ${h.bars}거래일`;
  if (style === "day" || style === "scalping") return "당일 청산";
  const bars = style ? LEGACY_STYLE_BARS[style] : undefined;
  return bars ? `최대 ${bars}거래일` : "보유기간 미상";
}

/** "약 1주" — 거래일 수만으로 감이 안 오는 사용자를 위한 보조 표기. */
export function holdingApprox(
  horizon: string | null | undefined,
  style?: string | null,
): string | null {
  const h = horizonSpec(horizon);
  if (h) return h.approx;
  if (style === "swing") return "약 2주";
  if (style === "position") return "약 3개월";
  return null;
}

/** "단기" / "중기" / "장기". 기간이 없는 옛 데이터는 null. */
export function horizonLabel(horizon: string | null | undefined): string | null {
  return horizonSpec(horizon)?.label ?? null;
}

export interface ExitPlanLine {
  trigger: string;
  action: string;
}

/**
 * 매매 계획 — 엔진이 자동 집행하는 순서 그대로.
 *
 * **목표가는 «파는 트리거»가 아니다.** 목표에 닿으면 팔지 않고 손절을 본전으로 올린 뒤
 * 기간까지 보유한다(2026-08-22 채택, 12개 비교에서 예외 없이 우세). 파는 주체는 기간이다.
 * 이걸 안 적으면 사용자는 목표가에서 전량 파는 걸로 이해한다 — 실제 손익과 어긋난다.
 */
export function exitPlanLines(
  horizon: string | null | undefined,
  opts: { tp1?: number | null; stop?: number | null; style?: string | null } = {},
): ExitPlanLine[] {
  const { tp1, stop, style } = opts;
  const h = horizonSpec(horizon);
  const bars = h?.bars ?? (style ? LEGACY_STYLE_BARS[style] : undefined);
  const fmt = (v: number | null | undefined) =>
    v == null ? "목표" : Math.round(v).toLocaleString();
  const lines: ExitPlanLine[] = [];

  if (stop != null) {
    lines.push({ trigger: `손절 ${fmt(stop)} 이탈`, action: "전량 청산" });
  }
  if (tp1 != null) {
    lines.push({
      trigger: `목표 ${fmt(tp1)} 도달`,
      action: h
        ? "팔지 않고 손절을 본전으로 올림 — 이후엔 손해 없이 상승만 노림"
        : "절반 익절 · 남은 절반은 손절선을 본전으로 올림",
    });
  }
  if (bars && bars > 1) {
    lines.push({ trigger: `${bars}거래일이 되면`, action: "그날 종가에 전량 매도" });
  }
  return lines;
}

/** 카드 헤더용 한 줄 — "단기 · 최대 5거래일 (약 1주)". */
export function holdingSummary(
  horizon: string | null | undefined,
  style?: string | null,
): string {
  const label = horizonLabel(horizon);
  const main = holdingLabel(horizon, style);
  const approx = holdingApprox(horizon, style);
  const tail = approx ? `${main} (${approx})` : main;
  return label ? `${label} · ${tail}` : tail;
}
