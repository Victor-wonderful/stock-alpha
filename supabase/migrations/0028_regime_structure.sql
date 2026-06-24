-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0028 — 레짐 2축화: 추세/횡보 구조 + 4국면(market_state)          ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06-24): 기존 레짐은 방어↔공격 1축(risk_on/off)뿐이라 '하락추세'와
--   '횡보(레인지)'를 구분 못 함 → 평균회귀 셋업을 우호 국면(횡보)에 배치 불가.
--   효율성비율(Efficiency Ratio=|순변동|/|경로합|) 평균으로 추세/횡보를 판정,
--   방향(score)과 결합해 uptrend/downtrend/range 로 라우팅한다.
--   nullable 추가 — 기존 행/하위호환 보존.

alter table market_regime add column if not exists structure    text;  -- trend | chop
alter table market_regime add column if not exists market_state text;  -- uptrend | downtrend | range
