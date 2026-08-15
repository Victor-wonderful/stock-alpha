import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// 공개 데이터 전용 클라이언트 — 쿠키를 읽지 않는다.
//
// 왜 따로 두는가: lib/supabase/server.ts 의 createClient() 는 next/headers 의
// cookies() 를 호출한다. 서버 컴포넌트에서 cookies() 를 건드리는 순간 그 요청은
// '동적'으로 확정돼 Next 의 fetch 캐시가 전부 무효가 된다. 리포트·시그널·시세·
// 백테스트는 로그인과 무관한 공개 데이터라 쿠키가 필요 없었는데도, 이 한 줄 때문에
// 매 클릭마다 모든 쿼리를 다시 돌고 있었다(쿼리 1회 왕복 실측 ~350ms).
//
// 권한은 그대로다: 기존 쿠키 클라이언트도 비로그인 상태에선 anon 으로 동작했으므로
// RLS 결과가 동일하다. 사용자 세션이 필요한 건 getUserRiskPct 하나뿐이고,
// 그건 계속 쿠키 클라이언트를 쓴다.
//
// 캐시: supabase-js 에 Next 의 fetch 를 주입해 GET 응답을 60초간 재사용한다.
// 데이터는 하루 두 번(08:30 모닝 / 16:30 데일리 배치)만 바뀌므로 60초는 넉넉히 신선하다.
// 자정 날짜 롤오버 때 최대 60초 옛 라벨이 보일 수 있는데, 그 폭이 5분보다 안전해서
// 60 을 골랐다. 관련 이력: 발행 라벨 date.today() 롤오버 버그.
export const PUBLIC_DATA_REVALIDATE_SEC = 60;

export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // 서버에서 세션을 유지·갱신할 이유가 없다(공개 읽기 전용).
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, {
            ...init,
            next: { revalidate: PUBLIC_DATA_REVALIDATE_SEC },
          }),
      },
    },
  );
}
