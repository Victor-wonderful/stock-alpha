import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";

import { VectaLogo } from "@/components/VectaLogo";
import { createClient } from "@/lib/supabase/server";
import { signIn, signUp } from "./actions";

/**
 * 로그인 · 회원가입.
 *
 * 화면은 있었는데 **사이트 어디에서도 여기로 올 수 없었다**(머리의 계정 아이콘이
 * «로그인 준비 중» 이라 적힌 죽은 버튼이었다). 2026-08-24 Victor 지적으로 길을
 * 뚫으면서 화면도 같이 정리한다:
 *
 *  · 로그인과 회원가입을 **한 화면 두 탭**으로 가른다. 예전엔 버튼 두 개가 나란히
 *    있어서 «가입인지 로그인인지» 누르기 전까지 알 수 없었다
 *  · 오류 색으로 시세 색(bull)을 쓰던 것을 고친다 — 빨강은 이 제품에서 «올랐다»는
 *    뜻이라 오류에 쓰면 축이 섞인다
 *  · 가입 뒤 확인 메일이 필요한 경우를 화면에서 말한다(예전엔 조용히 대시보드로
 *    보냈고, 로그인이 안 된 상태라 다시 튕겨 나왔다)
 */
export const metadata = {
  title: "로그인 — VECTA Stock",
  description: "VECTA Stock 계정으로 로그인하거나 새로 가입합니다.",
};

const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string; sent?: string }>;
}) {
  const { error, next, mode, sent } = await searchParams;

  // 이미 로그인한 사람에게 로그인 화면을 보여주지 않는다.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

  const isSignup = mode === "signup";
  const nextValue = next ?? null;
  const doSignIn = signIn.bind(null, nextValue);
  const doSignUp = signUp.bind(null, nextValue);
  const tabHref = (m: "login" | "signup") => {
    const q = new URLSearchParams();
    if (m === "signup") q.set("mode", "signup");
    if (next) q.set("next", next);
    const s = q.toString();
    return s ? `/login?${s}` : "/login";
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-6 py-12">
      <Link href="/" aria-label="VECTA Stock 홈" className="self-start">
        <VectaLogo className="flex items-center gap-2" />
      </Link>

      <h1 className="mt-7 text-[22px] font-bold leading-[1.3] tracking-[-0.4px] text-text">
        {isSignup ? "VECTA 계정 만들기" : "다시 오셨네요"}
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.7] text-text-mute">
        관심 종목·리스크 진단·알림은 계정이 있어야 저장됩니다. 픽과 분석은 로그인 없이도
        볼 수 있습니다.
      </p>

      {/* 탭 — 두 버튼을 나란히 두면 지금 무엇을 하는 화면인지가 사라진다. */}
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-[10px] border border-border bg-surface-2 p-1">
        {(["login", "signup"] as const).map((m) => {
          const on = (m === "signup") === isSignup;
          return (
            <Link
              key={m}
              href={tabHref(m)}
              className={`rounded-[7px] py-2 text-center text-[13px] font-semibold transition-colors ${
                on ? "bg-surface text-text shadow-sm" : "text-text-mute hover:text-text"
              }`}
            >
              {m === "login" ? "로그인" : "회원가입"}
            </Link>
          );
        })}
      </div>

      {sent === "1" && (
        <div className="mt-5 flex gap-2.5 rounded-[10px] border border-good/30 bg-good-soft px-4 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
          <p className="text-[13px] leading-[1.7] text-text">
            확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 이 화면에서 로그인해 주세요.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-5 flex gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <p className="text-[13px] leading-[1.7] text-text">
            {error}
            {isSignup && (
              <span className="mt-1 block text-text-mute">
                입력하신 값은 주소창에 남기지 않습니다 — 번거롭더라도 다시 적어 주세요.
              </span>
            )}
          </p>
        </div>
      )}

      <form action={isSignup ? doSignUp : doSignIn} className="mt-5 space-y-4">
        {/* 가입에만 있는 두 칸 — 순서는 Victor 가 정한 대로(닉네임 · 연락처 · 이메일 ·
            비밀번호). 로그인은 이메일·비밀번호 둘이면 된다. */}
        {isSignup && (
          <>
            <div>
              <label
                className="block text-[13px] font-semibold text-text"
                htmlFor="nickname"
              >
                닉네임{" "}
                <span className="font-normal text-text-mute">
                  화면에 보이는 이름 · 20자 이내
                </span>
              </label>
              <input
                id="nickname"
                name="nickname"
                type="text"
                required
                maxLength={20}
                placeholder="남산자산"
                className={FIELD}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-text" htmlFor="phone">
                연락처
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                required
                placeholder="010-1234-5678"
                className={FIELD}
              />
              <p className="mt-1.5 text-[11.5px] leading-[1.6] text-text-mute">
                본인 확인과 중요 공지에만 씁니다. 광고 전화는 하지 않습니다.
              </p>
            </div>
          </>
        )}
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
            placeholder="name@example.com"
            className={FIELD}
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-text" htmlFor="password">
            비밀번호{" "}
            {isSignup && <span className="font-normal text-text-mute">8자 이상</span>}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 8 : 6}
            className={FIELD}
          />
        </div>

        {/* 동의는 둘로 나눈다 — 약관과 개인정보는 다른 문서다. 하나로 묶으면 무엇에
            동의한 것인지 나중에 아무도 말할 수 없다.
            요약을 체크박스 안에 적고, 전문은 새 창으로 연다(가입하다 말고 화면을
            떠나면 입력값이 사라진다). */}
        {isSignup && (
          <div className="space-y-2.5 rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
            <label className="flex gap-2.5">
              <input
                type="checkbox"
                name="agree_terms"
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span className="text-[12px] leading-[1.7] text-text-dim">
                <span className="font-semibold text-text">이용약관에 동의합니다</span>{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-accent hover:underline"
                >
                  전문 보기
                </Link>
                <br />
                투자 참고 정보를 제공하는 서비스입니다. 자금을 맡거나 매매를 대신하지
                않으며, 수익을 약속하지 않습니다.
              </span>
            </label>
            <label className="flex gap-2.5 border-t border-border-soft pt-2.5">
              <input
                type="checkbox"
                name="agree_privacy"
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span className="text-[12px] leading-[1.7] text-text-dim">
                <span className="font-semibold text-text">
                  개인정보 수집·이용에 동의합니다
                </span>{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-accent hover:underline"
                >
                  전문 보기
                </Link>
                <br />
                닉네임·연락처·이메일을 받습니다. 본인 확인과 중요 공지에 쓰고, 탈퇴하면
                지웁니다. 제3자에게 넘기거나 광고에 쓰지 않습니다.
              </span>
            </label>
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-[9px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
        >
          {isSignup ? "가입하기" : "로그인"}
        </button>
      </form>

      <p className="mt-6 text-[11.5px] leading-[1.7] text-text-mute">
        이 서비스는 유사투자자문업자가 불특정 다수를 대상으로 제공하는 투자 참고 정보이며,
        맞춤 자문이 아닙니다. 계정을 만들어도 자금을 맡거나 매매를 대신하지 않습니다.
      </p>

      <Link
        href="/"
        className="mt-5 self-start text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        ← 로그인 없이 둘러보기
      </Link>
    </main>
  );
}
