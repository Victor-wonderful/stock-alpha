import { createClient } from "@/lib/supabase/server";
import { HomeHero } from "@/components/HomeHero";
import FocusContent from "./focus/_content";

/**
 * 홈 = 추천 화면. (IA 1단계, 2026-08-22)
 *
 * 예전 홈은 독립된 화면이 아니라 «다른 화면들의 요약본»이었다. 섹션 8개 중 7개가
 * 다른 화면에도 그대로 있었고(위 절반 = 추천, 아래 절반 = 인사이트), 홈에만 있는 건
 * 「최근 보도」 하나뿐이었다. 데이터 함수도 추천과 6개를 공유했다 — 같은 화면을
 * 두 벌 유지한 셈이다.
 *
 * 더 큰 문제는 첫 화면에 종목이 한 개도 없었다는 것이다. 마케팅 배너가 화면 절반을
 * 먹고, 거기 달린 버튼이 「오늘의 추천 보기」였다 — 홈이 스스로 «진짜 답은 다른 데
 * 있다»고 안내하는 구조다. 세로 길이도 홈 2,340px / 추천 1,428px 로 홈이 900px 더
 * 긴데 정작 픽은 홈에 없었다.
 *
 * 그래서 홈을 없애고 추천을 그 자리에 올린다. 새로 만든 화면이 아니라 이미 완성된
 * 화면을 첫 자리로 옮긴 것이다 — 빈 날 화면("살 종목이 없습니다")도, 선정 과정
 * 3단계도 추천에 이미 있다.
 *
 * 배너는 **비로그인 방문자에게만** 남긴다. 처음 온 사람에겐 설명이 필요하지만,
 * 매일 오는 사람에게 같은 설명을 매일 보여주면 그건 상품을 가리는 것이다.
 * (구독을 열 때 별도 랜딩으로 분리한다.)
 *
 * 옮겨 간 것: 주간 브리핑·매크로 → 인사이트(이미 더 넓게 있었다) ·
 *   최근 보도 → 시장(components/RecentCoverage) · 최근 기업 분석 → 종목(/reports).
 */
export default async function HomePage() {
  // 세션 확인 실패는 «비로그인»으로 본다 — 배너 하나 때문에 홈이 죽으면 안 된다.
  let signedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }

  return <FocusContent hero={signedIn ? undefined : <HomeHero />} />;
}
