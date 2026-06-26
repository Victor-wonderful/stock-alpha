/**
 * Stock Alpha — 디자인 토큰 (Dark + Yellow)
 * design/stock-alpha-ui.pen 의 d-* 변수를 1:1 이식. 디자인 단일 출처.
 */

export const color = {
  bg: '#0B0C10',
  surface: '#16181D',
  surface2: '#1E2026',
  surface3: '#262931',
  border: '#2A2D35',
  borderSoft: '#1F2229',

  accent: '#DDF247',
  accent2: '#C8E034',
  accentSoft: '#DDF24722',

  good: '#4ADE80',
  goodSoft: '#4ADE8020',
  bad: '#F87171',
  badSoft: '#F8717120',
  warn: '#FBBF24',
  warnSoft: '#FBBF2420',
  warnBorder: '#FBBF2440',

  textPrimary: '#FFFFFF',
  textSecondary: '#9CA0A8',
  textTertiary: '#5C6068',
  textOnAccent: '#0B0C10',

  /** 캡슐 탭바 프로스트 글라스 배경 */
  tabGlass: '#1E2026F0',
} as const;

export const radius = {
  card: 20,
  inner: 12,
  pill: 999,
  badge: 8,
} as const;

export const space = {
  page: 20,
  section: 24,
  card: 16,
  gap: 12,
  tight: 8,
} as const;

/** 폰트 — 목업은 Inter. expo-font 로딩 전엔 시스템 폰트로 폴백. */
export const font = {
  family: 'Inter',
} as const;

/** 등락 색 — 손익 양수=good(green), 음수=bad(red). */
export function pnlColor(value: number) {
  return value >= 0 ? color.good : color.bad;
}

/** AI 판정 색 (배경, 글자) */
export function verdictColors(verdict: '매수' | '중립' | '관망') {
  switch (verdict) {
    case '매수':
      return { bg: color.accent, fg: color.textOnAccent };
    case '중립':
      return { bg: color.surface3, fg: color.textSecondary };
    case '관망':
    default:
      return { bg: color.surface3, fg: color.textTertiary };
  }
}

export type Color = keyof typeof color;
