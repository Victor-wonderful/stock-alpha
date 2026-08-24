import type { MetadataRoute } from "next";

/**
 * 검색엔진에게 **공개 화면만** 알린다(2026-08-24).
 *
 * 홈을 뺀 전 화면이 회원 전용이 되면서(middleware.ts), 크롤러가 /focus 같은 주소를
 * 긁으면 받아 가는 것은 픽이 아니라 **로그인 화면 HTML** 이다. 그대로 두면 검색
 * 결과에 「오늘의 픽」이라는 제목으로 로그인 화면이 수십 개 올라간다 — 사람에게도
 * 쓸모없고, 사이트가 «내용 없는 페이지 더미»로 평가된다.
 *
 * 그래서 목록을 middleware 의 공개 목록과 **같은 모양**으로 둔다. 한쪽만 고치면
 * 두 파일이 갈라지므로, 화면을 열거나 잠글 때는 두 곳을 같이 본다.
 *
 * 블로그(vecta-blog)는 별도 사이트라 자기 robots 를 갖는다. 지금은 그쪽이 유일한
 * 검색 유입 경로다 [[vecta-blog-bridge]].
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // 공개 목록(middleware.ts PUBLIC_PATHS)과 같은 곳. FAQ 는 검색에서 들어오는
      // 사람이 «여기가 뭐 하는 곳인지» 읽을 수 있는 유일한 화면이라 특히 열어 둔다.
      allow: ["/$", "/login", "/faq", "/terms", "/privacy"],
      // 나머지 전부 — 크롤러가 받아 가 봐야 로그인 화면이다
      disallow: "/",
    },
  };
}
