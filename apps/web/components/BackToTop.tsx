"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * 맨 위로 — 전 화면 공통(2026-08-25 Victor: "모든 메뉴 페이지가 아래로 쭉 내려오게
 * 되면 다시 위로 올라갈 수 있는 기능이 있으면 좋겠다").
 *
 * 이 앱은 긴 목록이 많다. 분석 100행, 성과 표, 인사이트 다섯 섹션 — 바닥까지 내려간
 * 뒤 머리로 돌아가려면 그만큼 다시 밀어 올려야 했다. 폰에서는 그게 특히 길다.
 *
 * ## 자리
 *
 * 오른쪽 아래. 모바일에서는 **하단 탭바(58px) 위로** 올린다 — 겹치면 탭바를 누르려다
 * 이 버튼을 누른다. 안전영역(노치·홈바)도 같이 더한다.
 *
 * ## 언제 보이나
 *
 * 한 화면 높이만큼 내려갔을 때부터. 처음부터 떠 있으면 짧은 화면에서 «올라갈 데도
 * 없는데» 버튼이 본문을 가린다.
 *
 * ## 스크롤 방식
 *
 * 부드럽게 올리되, 시스템에서 «동작 줄이기»를 켠 사람에게는 즉시 이동한다. 어지럼을
 * 느끼는 사람에게 긴 스크롤 애니메이션은 접근성 문제다.
 *
 * 상태를 매 스크롤마다 set 하지 않는다 — 임계값을 넘나들 때만 바꾼다. 그러지 않으면
 * 스크롤 한 번에 리렌더가 수십 번 돈다.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const past = window.scrollY > window.innerHeight;
      setShow((prev) => (prev === past ? prev : past));
    };
    onScroll(); // 새로고침으로 중간에서 시작하는 경우
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
      className="fixed right-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface-2/95 text-text-dim shadow-sm backdrop-blur-md transition-colors hover:border-border-strong hover:text-text sm:right-6"
      style={{
        // 모바일 하단 탭바(58px) 위. md 이상에서는 탭바가 없지만 같은 여백을 둬도
        // 어색하지 않아 분기하지 않는다.
        bottom: "calc(58px + env(safe-area-inset-bottom) + 12px)",
      }}
    >
      <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
    </button>
  );
}
