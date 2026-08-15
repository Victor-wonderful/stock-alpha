import { GNB } from "@/components/GNB";

// 라우트 전환 중 표시되는 골격. App Router 는 loading.tsx 가 없으면 서버 렌더가
// 끝날 때까지 네비게이션을 통째로 차단한다 — 메뉴를 눌러도 화면이 그대로라
// "안 눌렸다"로 읽혔다. 운영 실측 응답이 /focus 3.8s · / 2.9~3.5s · /screener 2.6~3.0s 라
// 피드백 임계(300ms)를 한참 넘긴다.
//
// GNB 를 여기서도 그리는 이유: 이 프로젝트는 GNB 를 layout 이 아니라 각 페이지가
// (AppShell 을 통해) 직접 그린다. loading.tsx 가 GNB 를 빼면 전환 순간 헤더가 사라져
// 화면이 깜빡인다. 라우트 그룹으로 셸을 올리는 리팩터는 별건으로 둔다.

function Sk({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[12px] border border-border bg-surface ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <GNB />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-7 pb-10 sm:px-7">
        {/* 페이지 헤더 자리 */}
        <div className="mb-6 flex items-center gap-3">
          <Sk className="h-7 w-32" />
          <Sk className="h-4 w-48" />
        </div>

        {/* KPI 행 */}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Sk key={i} className="h-[92px]" />
          ))}
        </div>

        {/* 본문 패널 */}
        <Sk className="mb-3 h-[280px]" />
        <Sk className="h-[180px]" />

        <span className="sr-only" role="status">
          불러오는 중
        </span>
      </main>
    </div>
  );
}
