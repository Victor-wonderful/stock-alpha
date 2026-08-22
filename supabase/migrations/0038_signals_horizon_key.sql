-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0038 — 시그널 자연키에 보유기간(horizon) 추가                   ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 0037 로 기간이 1급 차원이 되면서, 같은 셋업이 여러 기간으로 동시에 발행될 수 있다
-- (예: 투매 소진은 단기 5일·중기 10일 둘 다 게이트 통과). 그런데 자연키가
-- (instrument_id, style, setup, session, signal_type) 라 기간이 빠져 있어서, 두 기간이
-- 같은 style 로 매핑되면 **뒤에 온 행이 앞의 행을 덮어쓴다** — 한 기간이 조용히 사라진다.
--
-- style 을 기간으로 대체하지 못하는 이유: trade_style 은 enum(scalping/day/swing/position)
-- 이라 "short" 같은 값을 넣을 수 없다(0037 작업 중 22P02 로 실제 실패했다). 그래서
-- style 은 화면 호환용으로 남기고 기간은 별도 컬럼으로 둔다.
--
-- NULLS NOT DISTINCT: 기간 도입 전 옛 행은 horizon 이 null 인데, 기본 동작(NULL 은 서로
-- 다름)이면 같은 조합이 중복 적재된다. null 도 같은 값으로 취급해 옛 키 동작을 보존한다.

alter table signals drop constraint if exists signals_natural_key;
alter table signals add constraint signals_natural_key
  unique nulls not distinct (instrument_id, style, setup, session, signal_type, horizon);
