// ② 국면 적응 — 추천 상단에 "지금 시장 국면 → 그래서 이 종류를 추천"을 명시(알파 노하우).
// 레짐(상승/하락/횡보)을 사용자 언어로. 순수 서버 컴포넌트.
import type { MarketStateView } from "@/lib/data";

// ⚠️ 여기 문구는 엔진의 억제 규칙(engine/reports/daily._pick_suppressed)을 사람 말로
// 옮긴 것이다. 규칙을 바꾸면 여기도 바꿔야 한다 — 2026-08-22 에 실제로 어긋나 있었다.
// 횡보는 «평균회귀·수급 위주»라고 적혀 있었는데 그 규칙은 그날 폐기됐고, 상승은
// «칼만·메디안·돌파»라고 적혀 있었는데 그 셋은 게이트를 통과한 적이 없다.
//
// 그래서 **셋업 이름을 쓰지 않는다.** 어떤 셋업이 나갈지는 백테스트 게이트가 매일
// 정하므로 화면에 박아두면 또 틀린다. 대신 «어떤 성격을 열고 무엇을 막는가»만 적는다.
const STATE: Record<
  string,
  { icon: string; name: string; routing: string; cls: string }
> = {
  uptrend: {
    icon: "📈",
    name: "상승추세",
    routing: "추세·역추세·수급 발행 — 평균회귀만 제외",
    cls: "border-good/30 bg-good-soft text-good",
  },
  downtrend: {
    icon: "📉",
    name: "하락추세",
    routing: "역추세·수급만 — 추세 매수는 막습니다(하락장 실측 근거)",
    cls: "border-bad/30 bg-bad-soft text-bad",
  },
  range: {
    icon: "↔️",
    name: "횡보",
    // 2026-08-22 재측정: 이름으로 나누던 것을 그만두고 «측정된 (셋업 × 기간)»만 연다.
    routing: "검증된 역추세 조합만 — 단기·중기. 나머지는 전부 막습니다",
    cls: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  },
};

/**
 * 국면 문구만 꺼내 쓰는 창구 — 「오늘의 픽」은 이 말을 자기 헤더 밴드 안에서
 * 네이비 위에 얹는다(별도 박스로 두면 시장 얘기가 화면에 두 번 나온다).
 * 문구는 한 곳에서만 정의한다 — 두 화면이 다른 국면 이름을 말하면 안 된다.
 */
export function regimeCopy(state: MarketStateView | null) {
  if (!state) return null;
  // 미상이면 횡보로 — «방향이 애매한 구간» 이 곧 횡보의 정의다.
  const s = STATE[state.market_state ?? ""] ?? STATE.range;
  return { ...s, drivers: state.drivers ?? [] };
}

/**
 * 국면 «이름과 색»만 꺼내 쓰는 창구 — 지난 브리프 목록처럼 «지금»이 아닌 화면이 쓴다.
 * RegimeHeader 는 "지금 시장: 상승추세"라고 말하는데, 두 달 전 브리프에 그 문장을
 * 얹으면 거짓말이 된다. 이름은 여기 한 곳에서만 정의한다.
 *
 * 모르는 값이면 null 이다 — 횡보로 되돌리지 않는다. 목록에서는 «모른다»와 «횡보였다»가
 * 전혀 다른 말이고, 모르는 것에 색을 주면 아는 것처럼 읽힌다.
 */
export function regimeName(marketState: string | null | undefined) {
  const s = marketState ? STATE[marketState] : undefined;
  return s ? { name: s.name, cls: s.cls } : null;
}

export function RegimeHeader({ state }: { state: MarketStateView | null }) {
  if (!state) return null;
  const s = STATE[state.market_state ?? ""] ?? STATE.range;
  return (
    <div className={`mb-4 rounded-[14px] border px-4 py-3 ${s.cls}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-sm font-bold">
          {s.icon} 지금 시장: {s.name}
        </span>
        <span className="text-[12px] font-medium opacity-90">→ {s.routing}</span>
      </div>
      {state.drivers.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {state.drivers.slice(0, 3).map((d, i) => (
            <span
              key={i}
              className="rounded-[999px] bg-black/5 px-2 py-0.5 text-[10px] opacity-90"
            >
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
