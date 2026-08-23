"use client";

import { useRouter } from "next/navigation";

/**
 * 행 전체가 링크인 목록 안에 두는 «두 번째 목적지».
 *
 * `<a>` 안에 `<a>` 는 넣을 수 없다(브라우저가 중첩을 풀어버려 바깥 링크가 깨진다).
 * 그래서 버튼으로 두고 클릭을 여기서 멈춘 뒤 직접 이동한다 — SymbolCode 와 같은 규약.
 *
 * 쓰이는 곳: 분석 목록. 행을 누르면 종목 상세(다른 화면과 같은 자리)로 가고,
 * 「리포트 →」를 누르면 그 판정의 본문으로 바로 간다.
 */
export function RowSubLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(href);
      }}
      className={`cursor-pointer hover:underline ${className}`}
    >
      {children}
    </button>
  );
}
