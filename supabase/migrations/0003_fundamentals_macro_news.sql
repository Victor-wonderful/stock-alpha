-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0003 — 펀더멘털 · 컨센서스 · 밸류에이션 · 매크로 · 뉴스         ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── 정규화 재무제표 ──
create table financials (
  instrument_id bigint not null references instruments(id) on delete cascade,
  period        text not null,                     -- '2024Q4','2024FY'
  fs_type       fs_kind not null default 'consolidated',
  revenue       numeric(24,2),
  op_income     numeric(24,2),                      -- 영업이익
  net_income    numeric(24,2),
  assets        numeric(24,2),
  equity        numeric(24,2),
  debt          numeric(24,2),
  ocf           numeric(24,2),                      -- 영업현금흐름
  fcf           numeric(24,2),                      -- 잉여현금흐름
  eps           numeric(20,4),
  bps           numeric(20,4),
  shares        numeric(24,2),
  extra         jsonb,                              -- 추가 항목 확장
  source        text,                               -- 'DART','EDGAR','FMP'
  primary key (instrument_id, period, fs_type)
);

-- ── 컨센서스 추정치 ──
create table estimates (
  instrument_id bigint not null references instruments(id) on delete cascade,
  period        text not null,
  source        text not null,                      -- 'consensus','FMP','self'
  eps_est       numeric(20,4),
  rev_est       numeric(24,2),
  target_price  numeric(20,4),
  rating        text,                               -- 'buy'/'hold'/'sell' 등
  as_of         date not null default current_date,
  primary key (instrument_id, period, source, as_of)
);

-- ── 산출 밸류에이션 (엔진 write) ──
create table valuations (
  instrument_id bigint not null references instruments(id) on delete cascade,
  date          date not null,
  per           numeric(14,4),
  pbr           numeric(14,4),
  ev_ebitda     numeric(14,4),
  roe           numeric(14,6),
  dcf_value     numeric(20,4),                      -- DCF 적정주가
  rel_value     numeric(20,4),                      -- 상대가치 적정주가(peer)
  upside_pct    numeric(10,4),                      -- (적정-현재)/현재
  method        jsonb,                              -- WACC, 성장가정, peer 목록 등
  source_version text,
  primary key (instrument_id, date)
);

-- ── 매크로 시계열 ──
create table macro (
  series_id     text not null,                      -- 'DGS10','BOK_BASE_RATE','USDKRW'
  date          date not null,
  value         numeric(24,6),
  source        text not null,                      -- 'FRED','ECOS'
  primary key (series_id, date)
);

-- ── 뉴스 / 공시 ──
create table news (
  id            bigint generated always as identity primary key,
  instrument_id bigint references instruments(id) on delete cascade,
  source        text,
  headline      text not null,
  url           text,
  published_at  timestamptz not null,
  sentiment     numeric(5,4),                       -- -1 ~ 1
  llm_summary   text,
  created_at    timestamptz not null default now()
);
create index on news (instrument_id, published_at desc);
