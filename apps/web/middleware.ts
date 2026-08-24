import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// 세션 토큰 갱신 + 보호 라우트 가드
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 보호 라우트: 미로그인 → /login
  // /expert 는 작성 도구라 로그인 없이는 할 수 있는 게 없다. 화면 안에서 «로그인이
  // 필요합니다»를 보여주는 것보다 바로 로그인 화면으로 보내고 **돌아올 곳을 기억**하는
  // 편이 낫다(2026-08-24).
  const protectedPaths = ["/dashboard", "/expert"];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // 파라미터 이름은 next — 로그인 액션(app/login/actions)이 읽는 이름과 맞춘다.
    // 예전에는 redirect 로 넣어 두고 아무도 안 읽어서, 로그인하면 언제나 대시보드로 갔다.
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
