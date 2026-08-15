// VECTA 브랜드 로고 — 심볼(그라디언트 삼각형 + 상승 화살표) + 워드마크.
// 원본: 브랜드 사이트(vecta-web) 헤더 SVG. 폰트 의존 없는 순수 패스라 그대로 이식했다.
// VECTA = VECTOR(방향) + DELTA(변화). 삼각형이 델타, 화살표가 벡터.

// 그라디언트는 문서 전역 id 를 참조한다. 한 페이지에 심볼이 여러 번 놓여도
// 정의가 동일하므로 렌더 결과에 차이가 없다.
const GRADIENT_ID = "vecta-symbol-gradient";

export function VectaSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="VECTA">
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#38c6e0" />
          <stop offset="0.5" stopColor="#2e8fff" />
          <stop offset="1" stopColor="#7a5cff" />
        </linearGradient>
      </defs>
      {/* 델타(Δ) — 속을 비운 삼각형 */}
      <g transform="translate(22 4) scale(0.86 0.8605)">
        <path
          d="M50 0 L100 86 L0 86 Z M50 24 L79 74 L21 74 Z"
          fillRule="evenodd"
          fill={`url(#${GRADIENT_ID})`}
        />
      </g>
      {/* 벡터 — 우상향 화살표 */}
      <g transform="translate(14 30) scale(1 0.84)">
        <path
          d="M4.1 88.1 L61.1 31.1 L53.7 23.7 L82 18 L76.3 46.3 L68.9 38.9 L11.9 95.9 Z"
          fill={`url(#${GRADIENT_ID})`}
        />
      </g>
    </svg>
  );
}

// 워드마크 — currentColor 를 따르므로 배치한 곳의 text 색을 그대로 쓴다.
export function VectaWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 522.4 100"
      className={className}
      role="img"
      aria-label="VECTA"
      fill="currentColor"
    >
      <path d="M0 0 L21.4 0 L56.5 79 L91.5 0 L113 0 L65.8 100 L47.9 100 Z" />
      <path
        d="M18.3 0 L83.5 0 L83.5 18.75 L5.6 18.75 Z M0 43.3 L82 43.3 L82 59.4 L0 59.4 Z M6.3 68.8 L24.1 68.8 L39.3 83.9 L83 83.9 L81.7 100 L37.1 100 Z"
        transform="translate(119.2 0)"
      />
      <path
        d="M90.2 0 L36.2 0 A36.2 48 0 0 0 0 48 L0 52 A36.2 48 0 0 0 36.2 100 L90.2 100 L90.2 83.9 L38 83.9 A21 30 0 0 1 17.4 52 L17.4 48 A21 30 0 0 1 38 20.1 L90.2 20.1 Z"
        transform="translate(222.3 0)"
      />
      <path
        d="M0 0 L87 0 L87 18.75 L51.8 18.75 L51.8 100 L34.8 100 L34.8 18.75 L0 18.75 Z"
        transform="translate(331.7 0)"
      />
      <path
        d="M45.5 0 L69.6 0 L114.7 100 L96.9 100 L57.4 20.1 L17.4 100 L0 100 Z M57.1 74.5 L56.3 100 L43.8 100 Z"
        transform="translate(406.7 0)"
      />
    </svg>
  );
}

// 헤더용 잠금 조합 — 심볼 + 워드마크 + 서브브랜드.
// 우산 브랜드에 VECTA Stock / VECTA Crypto 가 함께 있어 제품 구분자를 붙인다.
// 좁은 폭에서는 심볼만 남긴다. 로고 잠금 조합은 175px 를 차지하는데,
// 375px 화면에서 그걸 유지하면 GNB 메뉴에 남는 폭이 0 이 된다(계측치).
// 심볼 자체가 aria-label="VECTA" 를 들고 있어 워드마크를 숨겨도 이름은 읽힌다.
export function VectaLogo({ className }: { className?: string }) {
  return (
    <span className={className}>
      <VectaSymbol className="h-[26px] w-[26px] shrink-0" />
      <VectaWordmark className="hidden h-[17px] w-auto text-text sm:block" />
      <span className="hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-text-dim sm:inline">
        Stock
      </span>
    </span>
  );
}
