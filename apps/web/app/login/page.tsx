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
      <p className="mt-1 text-sm text-neutral-400">Stock-Alpha 계정</p>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <form className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-neutral-400" htmlFor="email">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-400" htmlFor="password">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-neutral-400"
          />
        </div>

        <div className="flex gap-3">
          <button
            formAction={signIn}
            className="flex-1 rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200"
          >
            로그인
          </button>
          <button
            formAction={signUp}
            className="flex-1 rounded-md border border-neutral-700 px-4 py-2 font-medium hover:bg-neutral-900"
          >
            회원가입
          </button>
        </div>
      </form>
    </main>
  );
}
