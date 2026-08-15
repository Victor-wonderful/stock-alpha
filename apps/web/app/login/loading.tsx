// 로그인은 GNB 없이 중앙 정렬된 단독 화면이다. 루트 app/loading.tsx 를 그대로 쓰면
// 전환 중에만 상단 네비가 나타났다 사라져 화면이 튄다 — 이 라우트만 골격을 따로 둔다.
function Sk({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[12px] border border-border bg-surface ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <Sk className="h-8 w-56" />
      <Sk className="mt-2 h-4 w-24" />
      <Sk className="mt-6 h-[52px]" />
      <Sk className="mt-4 h-[52px]" />
      <Sk className="mt-6 h-11" />
      <span className="sr-only" role="status">
        불러오는 중
      </span>
    </main>
  );
}
