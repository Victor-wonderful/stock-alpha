/**
 * 관리 호스트의 전환 골격 — 루트 loading.tsx 는 회원용 GNB 를 그리므로 관리 호스트에서
 * 쓰면 전환 순간 회원 메뉴가 깜빡 보인다. 머리는 admin/layout 이 이미 그리고 있으니
 * 본문 자리만 비워 둔다.
 */
export default function AdminLoading() {
  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 sm:px-7 sm:pt-7">
      <div className="mb-5 h-[92px] animate-pulse rounded-[14px] bg-navy/80" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-[12px] border border-border bg-surface" />
        <div className="h-48 animate-pulse rounded-[12px] border border-border bg-surface" />
      </div>
    </main>
  );
}
