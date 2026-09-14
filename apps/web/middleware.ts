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
 *   /faq         «가입하면 뭐가 열리나» — 가입 전에 읽는 화면이라 잠글 수 없다
 *
 * 블로그(vecta-blog)는 별도 사이트라 이 목록과 무관하게 공개다. 지금은 그쪽이
 * 유일한 외부 유입 경로다.
 */
const PUBLIC_PATHS = ["/", "/login", "/faq", "/terms", "/privacy", "/auth"];

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

/**
 * 사이트의 대표 주소(2026-09-14, vecta.win). 비어 있으면 옛 주소 리다이렉트를 하지 않는다.
 * 프리뷰 배포에서는 값이 있어도 리다이렉트하지 않는다 — 프리뷰도 *.vercel.app 이라
 * 걸리면 프리뷰 화면을 볼 방법이 없어진다.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");

/**
 * 관리 호스트인가 — `admin.` 으로 시작하는 주소(admin.vecta.win · 개발은 admin.localhost:3000).
 *
 * 관리 화면을 회원 사이트와 **주소로** 가른다(2026-09-14 Victor: "별도 어드민 페이지가
 * 있어야 할 것 같다"). 로그인 시스템을 따로 만들지는 않는다 — 비밀번호 저장소가 둘이
 * 되면 새어 나갈 곳도 둘이고, DB 는 어차피 «이 요청이 운영자인가»를 profiles.is_admin
 * 으로 판정한다. 대신 입구를 나눈다:
 *   · admin.vecta.win/…  → app/admin/… 으로 조용히 바꿔 그린다(주소창은 그대로)
 *   · vecta.win/admin    → 404. 회원 사이트에는 관리 화면이 없는 것으로 보인다
 *   · 관리 호스트의 로그인은 운영자만 통과하고(app/admin/login), 그 뒤 OTP 를 한 번 더 묻는다
 * 쿠키는 호스트별이라 회원 사이트의 세션은 관리 호스트로 넘어오지 않는다 — 그래서
 * 관리 호스트에 있는 세션은 전부 관리 로그인을 거친 것이다.
 */
function isAdminHost(hostname: string): boolean {
  return hostname.startsWith("admin.");
}

/** 관리 호스트에서 로그인 없이도 열리는 곳 — 로그인 화면뿐이다. */
const ADMIN_OPEN = ["/login"];
/** 로그인은 했지만 OTP 를 아직 안 거친 사람이 갈 수 있는 곳. */
const ADMIN_PRE_MFA = ["/login", "/otp"];

// 세션 토큰 갱신 + 공개 목록 게이트 + 호스트 분기
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

  const { pathname, search } = request.nextUrl;
  const hostname = (request.headers.get("host") ?? "").split(":")[0];

  // ── 옛 주소 → 대표 주소 ──
  // 프로덕션 별칭이 둘(stock-alpha-olive · stock-alpha-victor-alpha)이라 "사이트가
  // 두 개냐"는 혼란이 실제로 있었다. 도메인이 생겼으니 옛 주소는 전부 그리로 보낸다.
  if (
    SITE_URL &&
    process.env.VERCEL_ENV === "production" &&
    hostname.endsWith(".vercel.app")
  ) {
    return NextResponse.redirect(`${SITE_URL}${pathname}${search}`, 308);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── 관리 호스트 ──
  if (isAdminHost(hostname)) {
    // 검색엔진에는 아무것도 알리지 않는다 — 로그인 화면조차.
    if (pathname === "/robots.txt") {
      return new NextResponse("User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    // 내부 경로를 그대로 친 경우(/admin/members) — 주소를 깨끗한 쪽으로 돌려보낸다.
    // 서버 액션이 옛 redirect("/admin/…") 를 남겨 뒀더라도 여기서 흡수된다.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.slice("/admin".length) || "/";
      return NextResponse.redirect(url, 308);
    }

    if (!user) {
      if (!ADMIN_OPEN.includes(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        if (pathname !== "/") url.searchParams.set("next", pathname + search);
        return NextResponse.redirect(url);
      }
    } else {
      // 비밀번호는 맞았다. OTP 까지 거쳤는가 — 세션의 보증 수준(aal)으로 안다.
      // aal2 = OTP 통과. 아직이면 /otp 로(등록 안 한 사람은 그 화면이 등록부터 시킨다).
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const verified = aal?.currentLevel === "aal2";
      if (!verified && !ADMIN_PRE_MFA.includes(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/otp";
        url.search = "";
        return NextResponse.redirect(url);
      }
      if (verified && ADMIN_PRE_MFA.includes(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    // admin.vecta.win/members → app/admin/members. 주소창은 바뀌지 않는다.
    const url = request.nextUrl.clone();
    url.pathname = "/admin" + (pathname === "/" ? "" : pathname);
    const headers = new Headers(request.headers);
    // 루트 레이아웃이 회원용 푸터·하단 탭바를 빼도록 알린다(app/layout.tsx).
    headers.set("x-vecta-admin", "1");
    const rewritten = NextResponse.rewrite(url, { request: { headers } });
    // 위에서 갱신한 세션 쿠키를 옮겨 싣는다 — 안 옮기면 토큰 갱신이 사라진다.
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    return rewritten;
  }

  // ── 회원 사이트 ──
  // 관리 화면은 이 호스트에 없다. 「권한이 없습니다」가 아니라 «없는 주소»여야 한다.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/__no_such_page";
    return NextResponse.rewrite(url);
  }

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
