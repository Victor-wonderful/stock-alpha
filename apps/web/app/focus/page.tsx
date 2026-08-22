// 오늘의 픽 — 화면 본체는 `_content`. 홈(`/`)은 상태판이고 여기가 실행 계획이다
// (2026-08-22 Victor 확정, app/page.tsx 주석 참조).
//
// force-dynamic 을 쓰지 않는다: 그 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

export { default } from "./_content";
