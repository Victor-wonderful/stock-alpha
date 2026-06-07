-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0007 — 시그널 3축 확장: setup(플레이북) · session(세션)        ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 시그널은 이제 style(보유기간) × setup(플레이북) × session(세션) 조합으로 표현.
-- 같은 종목도 (스윙×과대낙폭반등×정규장) 와 (데이트×종가베팅×종가) 가 별개 시그널.

-- ── 셋업/플레이북 ──
create type trade_setup as enum (
  'factor_composite',   -- 멀티팩터 종합 (포지션/스윙 기본)
  'leader_trend',       -- 주도주 추세
  'oversold_bounce',    -- 과대낙폭 반등
  'breakout',           -- 돌파(신고가·박스)
  'close_betting',      -- 종가베팅
  'theme',              -- 테마주 (데이터 확보 후)
  'new_listing'         -- 신규주 (데이터 확보 후)
);

-- ── 세션 ──
create type trade_session as enum (
  'pre',        -- 프리장(장전 시간외)
  'regular',    -- 정규장
  'close',      -- 종가 단일가
  'after'       -- 애프터장(장후 시간외)
);

-- ── signals 확장 ──
alter table signals
  add column setup   trade_setup   not null default 'factor_composite',
  add column session trade_session not null default 'regular';

create index on signals (setup, created_at desc);
create index on signals (instrument_id, style, setup, created_at desc);

-- ── recommendations 확장 ──
alter table recommendations
  add column setup   trade_setup   not null default 'factor_composite',
  add column session trade_session not null default 'regular';

-- ── backtests: 플레이북별 검증을 위해 setup 추가 ──
alter table backtests
  add column setup trade_setup;
