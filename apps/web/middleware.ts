import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * 공개 목록 — **여기 없는 화면은 전부 로그인해야 보인다**(2026-08-24 Victor 확정).
 *
 * 예전에는 반대였다. `protectedPaths = ["/dashboard", "/expert"]` 처럼 «잠글 것»만
 * 적어 두니, 화면을 새로 만들 때마다 잠그는 걸 잊어야만 사고가 났다 — 실제로 8개
 * 메뉴가 전부 비로그인에게 열려 있었고, 가입한 사람이 가입 안 한 사람보다 더 볼 수
 * 있는 것이 하나도 없었다.
 *
 * 목록을 뒤집으면 **새 화면은 기본이 잠김**이라 잊을 수가 없다. 여는 것은 매번
 * 의식적인 결정이어야 한다.
 *
 * 각 항목이 열려 있어야 하는 이유:
 *   /            랜딩 — 처음 온 사람이 «여기가 뭐 하는 곳인지» 볼 자리
 *   /login       로그인·회원가입(한 화면 두 탭)
 *   /terms       이용약관 ─┐ 가입 **전에** 읽고 동의하는 문서다. 잠그면 동의 자체가
 *   /privacy     개인정보처리방침 ─┘ 성립하지 않는다(법적 요건).
 *   /auth        메일 인증 콜백 등 — 로그인 과정 자체라 로그인을 요구할 수 없다
 *
 * 블로그(vecta-blog)는 별도 사이트라 이 목록과 무관하게 공개다. 지금은 그쪽이
 * 유일한 외부 유입 경로다.
 */
const PUBLIC_PATHS = ["/", "/login", "/terms", "/privacy", "/auth"];

/**
 * 화면이 아니라 «파일»인 주소들 — 게이트 밖이다.
 *
 * matcher 가 걸러 주는 것은 _next 정적 파일과 이미지 확장자뿐이라, robots.txt 는
 * 그대로 미들웨어를 탄다. 그러면 크롤러가 robots.txt 를 달라고 했을 때 **로그인
 * 화면으로 리다이렉트**되고, 크롤러 입장에서는 robots.txt 가 없는 사이트가 된다 —
 * 정작 그 파일이 «회원 화면은 긁지 마라»를 적어 둔 파일인데 그것부터 못 읽는다.
 */
const PUBLIC_FILES = ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_FILES.includes(pathname)) return true;
  return PUBLIC_PATHS.some((p) =>
    // "/" 는 접두어로 보면 모든 경로가 걸린다 — 정확히 일치할 때만 공개다.
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/"),
  );
}

// 세션 토큰 갱신 + 공개 목록 게이트
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

  const { pathname } = request.nextUrl;

  // API 는 리다이렉트하지 않는다 — fetch 가 HTML 로그인 화면을 받아 파싱에서 죽는다.
  // 각 라우트가 스스로 세션을 보고 401 을 낸다(app/api/instruments 참조).
  if (!user && !isPublic(pathname) && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // 파라미터 이름은 next — 로그인 액션(app/login/actions)이 읽는 이름과 맞춘다.
    // 예전에는 redirect 로 넣어 두고 아무도 안 읽어서, 로그인하면 언제나 대시보드로 갔다.
    // 로그인 뒤 **원래 가려던 화면**으로 돌려보내는 것이 이 게이트의 절반이다 —
    // 벽에 부딪힌 사람을 처음으로 되돌려 보내면 두 번 다시 그 화면을 못 찾는다.
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
