-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0004 — 분석 산출물 (공유 출처: 엔진 write, 웹/리포트/봇 read)   ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── 팩터 스코어 ──
create table factor_scores (
  instrument_id   bigint not null references instruments(id) on delete cascade,
  date            date not null,
  value_z         numeric(10,4),
  quality_z       numeric(10,4),
  momentum_z      numeric(10,4),
  growth_z        numeric(10,4),
  lowvol_z        numeric(10,4),
  size_z          numeric(10,4),
  composite_alpha numeric(10,4),                    -- 가중 합성 알파
  sector_rank     integer,                          -- 섹터 내 랭크
  source_version  text,
  primary key (instrument_id, date)
);
create index on factor_scores (date, composite_alpha desc);

-- ── 시그널 (스타일 1급 차원 + 기술적 구조 기반 가격 레벨) ──
create table signals (
  id              bigint generated always as identity primary key,
  instrument_id   bigint not null references instruments(id) on delete cascade,
  created_at      timestamptz not null default now(),
  signal_type     signal_kind not null,
  style           trade_style not null,             -- ★ scalping/day/swing/position
  strength        numeric(5,4) not null,            -- 0~1 신뢰도
  timeframe       text not null,                     -- 스타일 종속 (1m..1w)
  entry_price     numeric(20,4),
  stop_loss       numeric(20,4),
  tp1             numeric(20,4),
  tp2             numeric(20,4),
  tp3             numeric(20,4),
  risk_reward     numeric(10,4),                     -- R 단위 손익비
  position_size_pct numeric(8,4),                    -- 권장 비중(%) — 사용자 리스크 기준
  holding_horizon text,                              -- 'minutes','intraday','days','weeks','months'
  rule_payload    jsonb,                             -- 트리거 지표
  factor_payload  jsonb,                             -- 팩터 근거
  level_payload   jsonb,                             -- ATR/지지저항/스윙 근거
  llm_rationale   text,
  source_version  text,
  valid_until     timestamptz                        -- 시그널 만료 (데이트=당일 마감)
);
create index on signals (instrument_id, style, created_at desc);
create index on signals (style, created_at desc);
create index on signals (valid_until);

-- ── 추천 / 모델 포트폴리오 (스타일별) ──
create table recommendations (
  id            bigint generated always as identity primary key,
  basket_type   text not null,                       -- 'screener','model_portfolio','theme'
  style         trade_style not null,
  instrument_id bigint not null references instruments(id) on delete cascade,
  weight        numeric(8,6),                         -- 모델포트 비중 (합=1)
  conviction    numeric(5,4),
  thesis        text,
  entry_price   numeric(20,4),
  target_price  numeric(20,4),
  stop_loss     numeric(20,4),
  as_of         date not null default current_date,
  rebalance_id  bigint,                               -- 리밸런싱 묶음 식별
  created_at    timestamptz not null default now()
);
create index on recommendations (basket_type, style, as_of desc);

-- ── 백테스트 / 검증 결과 (시그널 품질 게이트) ──
create table backtests (
  id            bigint generated always as identity primary key,
  strategy_key  text not null,                        -- 전략/팩터 식별
  style         trade_style,
  params        jsonb,
  ic            numeric(10,6),                        -- Information Coefficient
  sharpe        numeric(10,4),
  mdd           numeric(10,4),                        -- Max Drawdown
  turnover      numeric(10,4),
  win_rate      numeric(6,4),
  avg_rr        numeric(10,4),                        -- 평균 손익비
  equity_curve  jsonb,
  period        text,                                 -- 백테스트 구간
  created_at    timestamptz not null default now()
);
create index on backtests (strategy_key, style, created_at desc);

-- ── AI 애널리스트 리포트 ──
create table reports (
  id            bigint generated always as identity primary key,
  report_type   report_kind not null,
  instrument_id bigint references instruments(id) on delete set null,  -- 종목 인뎁스에만
  user_id       uuid references auth.users(id) on delete cascade,      -- custom 에만
  title         text not null,
  as_of         date not null default current_date,
  status        text not null default 'draft',        -- draft/published
  rating        text,                                 -- 투자의견
  target_price  numeric(20,4),
  summary       text,
  file_url      text,                                 -- 발행 PDF/DOCX 경로
  source_refs   jsonb,                                -- 수치 근거 추적 (환각 방지)
  model_version text,
  created_at    timestamptz not null default now()
);
create index on reports (report_type, as_of desc);
create index on reports (instrument_id, as_of desc);
create index on reports (user_id, as_of desc);
