-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0016 — 오늘의 포커스(daily picks) 자연키                        ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 발행 규정 v1(2026-06-10): recommendations 에 basket_type='daily_focus' 로
-- 일일 픽을 적재. 같은 날 재실행 시 중복 누적 없이 갱신(upsert)되도록 자연키.

create unique index if not exists recommendations_natural_key
  on recommendations (basket_type, instrument_id, as_of);
