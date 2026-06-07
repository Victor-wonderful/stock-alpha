import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="grid h-6 w-6 place-items-center rounded bg-accent text-xs font-black text-white">
            α
          </span>
          Stock<span className="text-text-mute">-Alpha</span>
        </Link>
        <div className="flex items-center gap-5 text-sm text-text-dim">
          <Link href="/screener" className="hover:text-text">
            스크리너
          </Link>
          <Link href="/dashboard" className="hover:text-text">
            대시보드
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-text px-3 py-1.5 font-medium text-bg hover:opacity-90"
          >
            로그인
          </Link>
        </div>
      </nav>
    </header>
  );
}
