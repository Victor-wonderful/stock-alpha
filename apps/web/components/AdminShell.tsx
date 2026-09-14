import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";

import { adminSignOut } from "@/app/admin/login/actions";
import { VectaLogo } from "@/components/VectaLogo";
import type { PageStat } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";

/**
 * 관리 호스트(admin.vecta.win)의 머리.
 *
 * 회원 사이트의 GNB(8개 메뉴·검색·알림·회원가입)를 쓰지 않는다 — 관리 호스트에는
 * 그 화면들이 없어서 누르면 전부 404 다. 대신 관리에 있는 것만 세 개 세운다.
 * 로고 옆의 「관리」방패는 «지금 회원 사이트가 아니다»를 한눈에 말하는 표시다 —
 * 두 사이트가 같은 디자인이라 이것마저 없으면 어느 쪽에 있는지 헷갈린다.
 */
export function AdminHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-7">
        <Link href="/" aria-label="관리 홈" className="flex items-center gap-2.5">
          <VectaLogo className="flex items-center gap-2" />
          <span className="flex items-center gap-1 rounded-[999px] bg-navy px-2.5 py-1 text-[10.5px] font-bold tracking-[0.3px] text-on-navy">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            관리
          </span>
        </Link>
        {signedIn && (
          <>
            <AdminNav />
            <form action={adminSignOut} className="ml-auto">
              <button
                type="submit"
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-text-mute transition-colors hover:text-text"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                로그아웃
              </button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}

/**
 * 관리 화면의 골격 — AppShell 의 네이비 머리 밴드와 같은 모양, GNB 만 없다.
 * 같은 모양을 쓰는 이유: 밴드에 세우는 값(회원 수·대기 신청)이 전부 DB 가 센 숫자라
 * 「네이비 = 기계가 낸 데이터」규칙이 그대로 맞는다.
 */
export function AdminShell({
  title,
  subtitle,
  stats,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  stats?: PageStat[];
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-10 pt-5 sm:px-7 sm:pt-7">
      <div className="mb-5 rounded-[14px] bg-navy px-4 py-4 sm:mb-6 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-on-navy">{title}</h1>
            {subtitle && (
              <p className="mt-1.5 max-w-[70ch] text-xs leading-relaxed text-on-navy-2">
                {subtitle}
              </p>
            )}
          </div>
          {stats && stats.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-start gap-x-7 gap-y-2">
              {stats.map((s) => (
                <div key={s.label} className="text-right">
                  <p className="text-[10px] text-on-navy-3">{s.label}</p>
                  <p
                    className={`tnum mt-0.5 text-lg font-extrabold ${
                      s.tone === "accent"
                        ? "text-accent-on-navy"
                        : s.tone === "good"
                          ? "text-up-on-navy"
                          : s.tone === "bad"
                            ? "text-down-on-navy"
                            : "text-on-navy"
                    }`}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {children}
    </main>
  );
}
