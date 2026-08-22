-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0037 — 보유기간(horizon)을 1급 차원으로                        ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 지금까지 보유기간은 «스타일»(swing 10봉 / position 60봉)이 정했는데, 그 배정이
-- 셋업을 만들 때 손으로 적은 값이고 백테스트로 확인된 적이 없었다. 실제로 재보니
-- position 조합은 30개 중 0개만 게이트를 통과하는데 발행 시그널의 87%가 position 이었다.
--
-- 2026-08-21~22 실험(22개 셋업 × 3·5·10·20일, var/holding_trail_*.jsonl)에서 셋업마다
-- 맞는 기간이 다르다는 게 확인됐다:
--
--     과매도 반등   5일  +0.432      쌍바닥      20일 +0.486
--     변동성 수축   5일  +0.102      메디안      20일 +0.195
--     눌림목 매집   3일  +0.101      소르티노     20일 +0.146
--     투매 소진    10일  +0.252
--
-- 그래서 기간을 셋업의 속성으로 끌어올린다. 설계 전문은 docs/HORIZON_DESIGN.md.
--   단기  5거래일 · 시가 전량      · 목표 도달 시 본전스톱 · 손절 단일
--   중기 10거래일 · 시가 50%+50%   · 〃
--   장기 20거래일 · 시가 40+40+20% · 〃

alter table backtests
  add column if not exists horizon text;
comment on column backtests.horizon is
  'short|mid|long — 이 판정이 어느 보유기간을 가정했는가 (null=기간 도입 전 옛 행)';

alter table signals
  add column if not exists horizon text;
comment on column signals.horizon is
  'short|mid|long — 이 시그널의 보유기간. levels 는 이 기간의 프로파일로 산출된다';

alter table recommendations
  add column if not exists horizon text;
comment on column recommendations.horizon is
  'short|mid|long — 픽의 보유기간. 성과 집계를 (전략 × 기간)으로 나누는 축';

-- 기간별 조회 — 추천·스크리너가 기간으로 그룹핑한다
create index if not exists backtests_horizon_idx on backtests (setup, horizon);
create index if not exists signals_horizon_idx on signals (setup, horizon);
create index if not exists recommendations_horizon_idx
  on recommendations (basket_type, horizon, as_of);
