import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * 로그인한 사람 — **요청 하나당 한 번만** 묻는다.
 *
 * ## 왜 필요한가 (2026-08-25 측정)
 *
 * `supabase.auth.getUser()` 는 **부를 때마다 인증 서버로 왕복한다.** 쿠키만 읽는
 * `getSession()` 과 달리 토큰을 서버에 검증시키기 때문이고, 그래서 안전한 대신 비싸다.
 *
 * 그런데 화면 하나를 그리는 데 이게 여섯 번 불렸다:
 *
 *   미들웨어 1 · Footer 1 · AuthMenu 1
 *   └ AuthMenu 가 부르는 getMyExpert · getMyProfile · isAdmin 이 **각자 또** 1회씩
 *
 * 조회가 하나도 없는 `/faq` 가 운영에서 620~1200ms 였다(리다이렉트만 타는 경로는
 * 90ms). 그 차이의 대부분이 이 왕복이다.
 *
 * `cache()` 는 **한 요청 안에서** 같은 함수의 결과를 나눠 쓴다. 그래서 몇 군데서
 * 부르든 왕복은 한 번이다. 요청이 끝나면 버려지므로 «남의 세션을 보는» 일은 없다.
 *
 * ⚠️ 미들웨어는 다른 런타임이라 이 캐시를 못 쓴다 — 그쪽 1회는 남는다(90ms).
 *
 * ## 쓰는 법
 *
 * **화면을 그리는 코드는 이걸 쓴다.** 서버 액션(폼 제출)은 요청이 따로이므로 각자
 * `createClient()` 로 부르는 편이 낫다 — 거기서 굳이 캐시를 태울 이유가 없다.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
});

/** 로그인했는가 — 세션 자체가 필요 없을 때. */
export async function isSignedIn(): Promise<boolean> {
  return (await getSessionUser()) !== null;
}
