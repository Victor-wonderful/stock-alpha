"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 종목 코드 — 누르면 클립보드에 복사된다.
 *
 * 코드는 «읽는 값»이 아니라 «옮기는 값»이다. 증권사 앱이나 HTS 검색창에 넣으려면
 * 여섯 자리를 눈으로 옮겨 적어야 했다(2026-08-23 Victor 요청).
 *
 * ⚠️ 대부분의 코드가 «종목 상세로 가는 링크» 안에 들어 있다(스크리너 행 전체가
 * Link 인 곳도 있다). 그래서 클릭을 여기서 멈추지 않으면 복사와 동시에 페이지가
 * 넘어간다 — preventDefault + stopPropagation 을 둘 다 건다.
 *
 * 버튼으로 두되 생김새는 원래의 코드 글자 그대로다. 여기서 파랗게 칠하거나 밑줄을
 * 그으면 코드가 링크처럼 보여서, 정작 옆에 있는 «진짜 링크»(종목명)와 구분이 사라진다.
 */

/**
 * 클립보드 쓰기 — 성공 여부를 돌려준다.
 *
 * navigator.clipboard 는 (1) https·localhost 가 아닌 곳, (2) 권한이 막힌 환경에서
 * 없거나 거부한다. 그때를 위해 옛 execCommand 경로를 남긴다. 사파리·구형 안드로이드
 * 브라우저에서도 이쪽이 먹는다.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 대체 경로로 넘어간다.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // 화면 밖으로 — 보이면 클릭 순간 화면이 흔들린다.
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function SymbolCode({
  symbol,
  className = "",
}: {
  symbol: string | null | undefined;
  /** 원래 자리에서 쓰던 글자 크기·색을 그대로 넘긴다. */
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!symbol) return null;

  async function copy(e: React.MouseEvent) {
    // 링크 안에 있을 때 페이지가 넘어가지 않게.
    e.preventDefault();
    e.stopPropagation();
    if (!(await writeClipboard(symbol as string))) {
      // 복사가 안 됐는데 「복사됨」이라고 적으면 사용자는 붙여넣기를 시도했다가
      // 엉뚱한 값을 넣는다. 실패하면 아무 말도 하지 않는다.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`${symbol} 복사`}
      aria-label={`종목 코드 ${symbol} 복사`}
      className={`mono cursor-pointer rounded-[4px] px-0.5 transition-colors hover:bg-surface-3 ${className}`}
    >
      {copied ? <span className="text-pass">복사됨</span> : symbol}
    </button>
  );
}
