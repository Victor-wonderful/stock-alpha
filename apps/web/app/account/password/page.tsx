import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, KeyRound, TriangleAlert } from "lucide-react";

import { VectaLogo } from "@/components/VectaLogo";
import { updatePassword } from "@/app/login/actions";
import { getSessionUser } from "@/lib/session";

export const metadata = {
  title: "새 비밀번호 — VECTA Stock",
};

const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent";

/**
 * 새 비밀번호 — 두 부류가 같은 화면을 쓴다.
 *   · 재설정 메일 링크로 온 사람 (/auth/confirm 이 recovery 세션을 만들어 보냈다)
 *   · 로그인한 채로 바꾸고 싶은 사람 (푸터의 「비밀번호 변경」)
 * 둘 다 세션이 있으므로 updateUser 한 번이면 된다. 세션이 없으면 미들웨어가 이미
 * 로그인 화면으로 보냈겠지만, 한 번 더 본다.
 */
export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { error, done } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/password");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-6 py-12">
      <Link href="/" aria-label="VECTA Stock 홈" className="self-start">
        <VectaLogo className="flex items-center gap-2" />
      </Link>

      <h1 className="mt-7 flex items-center gap-2 text-[22px] font-bold leading-[1.3] tracking-[-0.4px] text-text">
        <KeyRound className="h-5 w-5 text-accent" aria-hidden />
        새 비밀번호
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.7] text-text-mute">
        <span className="font-mono text-text-dim">{user.email}</span> 계정의 비밀번호를 바꿉니다.
      </p>

      {done === "1" ? (
        <>
          <div className="mt-6 flex gap-2.5 rounded-[10px] border border-good/30 bg-good-soft px-4 py-3">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
            <p className="text-[13px] leading-[1.7] text-text">
              비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰시면 됩니다.
            </p>
          </div>
          <Link
            href="/"
            className="mt-5 w-full rounded-[9px] bg-accent px-4 py-2.5 text-center text-[14px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
          >
            홈으로
          </Link>
        </>
      ) : (
        <>
          {error && (
            <div className="mt-5 flex gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
              <p className="text-[13px] leading-[1.7] text-text">{error}</p>
            </div>
          )}
          <form action={updatePassword} className="mt-5 space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-text" htmlFor="password">
                새 비밀번호 <span className="font-normal text-text-mute">8자 이상</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={FIELD}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-text" htmlFor="confirm">
                한 번 더
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={FIELD}
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-[9px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
            >
              저장
            </button>
          </form>
        </>
      )}
    </main>
  );
}
