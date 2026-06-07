-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0002 — 마스터 · 시세 · 수급 (분석 입력 데이터)                  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── 종목 마스터 ──
create table instruments (
  id          bigint generated always as identity primary key,
  symbol      text not null,                       -- '005930', 'AAPL'
  exchange    text not null,                       -- 'KRX', 'NASDAQ', 'NYSE'
  name        text not null,
  sector      text,
  industry    text,
  asset_type  asset_kind not null default 'stock',
  currency    text not null default 'KRW',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (symbol, exchange)
);
create index on instruments using gin (name gin_trgm_ops);
create index on instruments (sector);

-- ── OHLCV (분/일/주봉) ──
create table ohlcv (
  instrument_id bigint not null references instruments(id) on delete cascade,
  ts            timestamptz not null,
  interval      text not null,                     -- '1m','5m','15m','1h','1d','1w'
  open          numeric(20,4) not null,
  high          numeric(20,4) not null,
  low           numeric(20,4) not null,
  close         numeric(20,4) not null,
  volume        numeric(20,2) not null default 0,
  adj_close     numeric(20,4),
  primary key (instrument_id, ts, interval)
);
create index on ohlcv (instrument_id, interval, ts desc);

-- ── 실시간 체결 틱 (스캘핑/데이트, 핫스토리지 — 주기적 롤업/TTL 권장) ──
create table ticks (
  instrument_id bigint not null references instruments(id) on delete cascade,
  ts            timestamptz not null,
  price         numeric(20,4) not null,
  size          numeric(20,2) not null,
  side          text,                              -- 'buy'/'sell' (체결 주체 추정)
  primary key (instrument_id, ts, price, size)
);
create index on ticks (instrument_id, ts desc);

-- ── 호가창 스냅샷 (마이크로구조) ──
create table orderbook (
  instrument_id bigint not null references instruments(id) on delete cascade,
  ts            timestamptz not null,
  bids          jsonb not null,                    -- [[price, size], ...]
  asks          jsonb not null,
  imbalance     numeric(10,6),                     -- (bidVol-askVol)/(bidVol+askVol)
  primary key (instrument_id, ts)
);
create index on orderbook (instrument_id, ts desc);

-- ── 수급 (일별) ──
create table flows (
  instrument_id bigint not null references instruments(id) on delete cascade,
  date          date not null,
  inst_net      numeric(20,2),                     -- 기관 순매수(주식수 또는 금액)
  foreign_net   numeric(20,2),                     -- 외국인 순매수
  retail_net    numeric(20,2),                     -- 개인 순매수
  short_volume  numeric(20,2),                     -- 공매도 거래량
  short_balance numeric(20,2),                     -- 공매도 잔고
  program_net   numeric(20,2),                     -- 프로그램 순매수
  primary key (instrument_id, date)
);
create index on flows (date);
