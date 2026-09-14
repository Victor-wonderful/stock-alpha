import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * 메일 링크가 도착하는 곳 — 가입 확인 · 비밀번호 재설정 · (나중에) 이메일 변경.
 *
 * 2026-09-14 까지 이 경로가 **없었다.** 미들웨어의 공개 목록에는 /auth 가 있었지만
 * 받아 주는 코드가 없어, 메일 링크는 Supabase 기본 흐름대로 «주소창 # 뒤에 토큰을
 * 붙여» 홈으로 떨어졌고 서버 쿠키 세션은 만들어지지 않았다. 게다가 Site URL 이
 * localhost 였다.
 *
 * 두 가지 형태를 받는다:
 *   · token_hash + type  — 메일 템플릿을 이 형태로 바꿨다(어느 브라우저에서 열어도 된다)
 *   · code                — PKCE 교환. 템플릿을 안 바꾼 경우의 기본 형태
 *
 * 성공하면 세션 쿠키가 실리고 next 로 보낸다. 실패하면 로그인 화면에 이유를 적는다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";
  // 우리 사이트 안의 경로만 — 남이 만든 링크로 바깥으로 튕기는 수법을 막는다.
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  const supabase = await createClient();
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return to(type === "recovery" ? "/account/password" : next);
    return to(fail(type, error.message));
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return to(next);
    return to(fail(null, error.message));
  }
  return to("/login?error=" + encodeURIComponent("링크가 올바르지 않습니다."));
}

function fail(type: EmailOtpType | null, message: string): string {
  const expired = /expired|invalid/i.test(message);
  const msg =
    type === "recovery"
      ? expired
        ? "재설정 링크가 만료됐습니다. 다시 요청해 주세요."
        : message
      : expired
        ? "확인 링크가 만료됐습니다. 로그인하면 확인 메일을 다시 보내 드립니다."
        : message;
  const path = type === "recovery" ? "/login/reset" : "/login";
  return `${path}?error=${encodeURIComponent(msg)}`;
}
