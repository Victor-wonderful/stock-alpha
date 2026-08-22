-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0039 — 픽 자연키에 보유기간(horizon) 추가 + 재현 바스켓         ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 0038 이 시그널에 한 일을 픽에도 한다. 자연키가
-- (basket_type, instrument_id, as_of) 라 **기간이 빠져 있다.** 0037 이후 같은 종목이
-- 같은 날 여러 기간으로 발행될 수 있는데(예: 투매 소진 = 단기·중기 동시 통과),
-- 그러면 뒤에 온 행이 앞의 행을 덮어써 한 기간이 조용히 사라진다.
--
-- NULLS NOT DISTINCT: 기간 도입 전 옛 픽은 horizon 이 null 이다. 기본 동작(NULL 은
-- 서로 다름)이면 같은 조합이 중복 적재되므로 null 도 같은 값으로 취급해 옛 키 동작을
-- 보존한다. 0038 과 같은 이유·같은 방식.

drop index if exists recommendations_natural_key;
create unique index if not exists recommendations_natural_key
  on recommendations (basket_type, instrument_id, as_of, horizon)
  nulls not distinct;

-- ── 재현(시뮬레이션) 바스켓 ────────────────────────────────────────
-- basket_type='resim_horizon' 은 «발행 기록이 아니라 계산 결과»다.
-- 2026-08-22 규칙 교체(지정가 진입 → 시가 진입 · 스타일 축 → 기간 축 · 목표를
-- 본전스톱 트리거로) 이전에 발행된 픽을, 실제 과거 시세로 **새 규칙이었다면 어땠을지**
-- 다시 계산해 넣는다(scripts/rewrite_picks_new_rules).
--
-- ⚠️ daily_focus(발행 기록)와 절대 섞지 말 것. 화면에서도 «재현»으로 표기한다.
--   · daily_focus   = 그날 실제로 발행한 것. 사후 수정 금지.
--   · resim_horizon = 같은 픽을 새 규칙으로 돌린 백테스트. 언제든 다시 계산 가능.
comment on column recommendations.basket_type is
  'daily_focus=실제 발행 픽 · resim_horizon=규칙 교체 전 픽의 새 규칙 재현(시뮬레이션) '
  '· screener/model_portfolio/theme=기타 바스켓';
