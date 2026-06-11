import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">로그인 / 회원가입</h1>
      <p className="mt-1 text-sm text-text-mute">Stock-Alpha 계정</p>

      {error && (
        <p className="mt-4 rounded-md border border-bull/30 bg-bull-soft px-3 py-2 text-sm text-bull">
          {error}
        </p>
      )}

      <form className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-text-mute" htmlFor="email">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-sm text-text-mute" htmlFor="password">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          />
        </div>

        <div className="flex gap-3">
          <button
            formAction={signIn}
            className="flex-1 rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
          >
            로그인
          </button>
          <button
            formAction={signUp}
            className="flex-1 rounded-md border border-border px-4 py-2 font-medium hover:bg-surface"
          >
            회원가입
          </button>
        </div>
      </form>
    </main>
  );
}
