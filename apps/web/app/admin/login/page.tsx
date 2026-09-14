import { TriangleAlert } from "lucide-react";

import { adminSignIn } from "./actions";

/**
 * 관리 로그인 — admin.vecta.win/login.
 *
 * 회원 로그인 화면(app/login)과 일부러 다르게 둔다: 탭도 회원가입도 없고, 문구도
 * 없다. 여기는 «들어올 사람이 정해진» 문이라 설명할 것이 없다.
 *
 * ⚠️ metadata 를 내보내지 않는다 — 관리 화면 전체의 규칙(app/admin/page.tsx).
 */
const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const doSignIn = adminSignIn.bind(null, next ?? null);

  return (
    <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-6 py-12">
      <h1 className="text-[20px] font-bold leading-[1.3] tracking-[-0.3px] text-text">
        운영자 로그인
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.7] text-text-mute">
        비밀번호 다음에 인증 앱의 6자리 코드를 한 번 더 묻습니다.
      </p>

      {error && (
        <div className="mt-5 flex gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <p className="text-[13px] leading-[1.7] text-text">{error}</p>
        </div>
      )}

      <form action={doSignIn} className="mt-5 space-y-4">
        <div>
          <label className="block text-[13px] font-semibold text-text" htmlFor="email">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            className={FIELD}
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-text" htmlFor="password">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={FIELD}
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-[9px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
        >
          다음
        </button>
      </form>
    </main>
  );
}
