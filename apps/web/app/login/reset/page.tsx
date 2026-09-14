import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";

import { VectaLogo } from "@/components/VectaLogo";
import { requestPasswordReset } from "@/app/login/actions";

export const metadata = {
  title: "비밀번호 재설정 — VECTA Stock",
};

const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent";

/**
 * 비밀번호를 잊은 사람 — 이메일 하나만 받는다.
 * 보냈다는 문구는 주소가 있든 없든 같다(app/login/actions requestPasswordReset).
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-6 py-12">
      <Link href="/" aria-label="VECTA Stock 홈" className="self-start">
        <VectaLogo className="flex items-center gap-2" />
      </Link>

      <h1 className="mt-7 text-[22px] font-bold leading-[1.3] tracking-[-0.4px] text-text">
        비밀번호 재설정
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.7] text-text-mute">
        가입할 때 쓴 이메일을 적어 주세요. 새 비밀번호를 정할 수 있는 링크를 보내 드립니다.
      </p>

      {sent === "1" ? (
        <div className="mt-6 flex gap-2.5 rounded-[10px] border border-good/30 bg-good-soft px-4 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
          <p className="text-[13px] leading-[1.7] text-text">
            가입된 주소라면 메일을 보냈습니다. 메일의 링크를 누르면 새 비밀번호를 정하는
            화면이 열립니다.
            <span className="mt-1 block text-text-mute">
              몇 분 안에 오지 않으면 스팸함을 확인하거나, 주소를 다시 확인해 주세요.
            </span>
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mt-5 flex gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
              <p className="text-[13px] leading-[1.7] text-text">{error}</p>
            </div>
          )}
          <form action={requestPasswordReset} className="mt-5 space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-text" htmlFor="email">
                이메일
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@example.com"
                className={FIELD}
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-[9px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
            >
              재설정 링크 보내기
            </button>
          </form>
        </>
      )}

      <Link
        href="/login"
        className="mt-6 self-start text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        ← 로그인으로
      </Link>
    </main>
  );
}
