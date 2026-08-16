-- 0031 — 시장 이벤트 캘린더 (예정된 것만)
--
-- 뉴스에는 두 종류가 있다: 미리 아는 것(FOMC·만기·리밸런싱·휴장)과 돌발적인 것
-- (공시·사고·지정학). 이 테이블은 **앞의 것만** 담는다.
--
-- 왜 앞의 것부터인가 — 날짜는 사후 수정이 없다. 감성점수·서프라이즈와 달리 과거를
-- 그대로 재현할 수 있어서 백테스트가 정직하다. 반대로 돌발 뉴스는 이미 실측에서
-- 기각됐다(pead 기대값 -0.02 → 게이트 탈락, disclosures 2,845건은 분류만).
--
-- 용도 두 가지:
--   1) 거래일 판정 — kind='holiday' 로 휴장일을 알면 "다음 거래일"을 단정할 수 있다.
--      (그전엔 공휴일을 몰라 휴장일에 '장전 플랜'을 띄웠다. 최근 반년 평일 휴장 11일)
--   2) 발행 억제 — block_entry=true 인 이벤트의 D-block_days_before ~ D0 구간에는
--      신규 진입 픽을 내지 않는다. 수익을 노리는 규칙이 아니라 알려진 변동성 구간을
--      피하는 규칙이라 기대값 게이트와 층이 다르다.

create table if not exists market_calendar (
  id            bigint generated always as identity primary key,
  date          date not null,
  -- 결정적 자연키. 같은 이벤트를 재시드해도 새 행이 아니라 갱신이 되도록.
  -- 0030 의 교훈: 부분/표현식 인덱스는 PostgREST on_conflict 가 매칭 못 한다.
  -- NULL 을 섞지 않는 순수 컬럼 조합으로 둔다.
  event_key     text not null,
  kind          text not null,             -- holiday/expiry/index_rebalance/ex_dividend
                                           -- /rate_decision/macro_release/earnings
  title         text not null,
  region        text not null default 'KR',            -- KR / US
  instrument_id bigint references instruments(id) on delete cascade,  -- 종목 이벤트만
  severity      smallint not null default 1,           -- 1 낮음 2 중간 3 높음
  -- 발행 억제 파라미터. 시드가 값을 정하고 코드는 읽기만 한다(규칙을 데이터로).
  block_entry       boolean  not null default false,
  block_days_before smallint not null default 0,       -- D-N 부터 막음(0 = 당일만)
  source        text,                                  -- pykrx / computed / seed-file
  meta          jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 유니크는 event_key 단독. 날짜를 키에 넣으면 안 된다 — 만기일이 휴장으로 하루
-- 당겨졌을 때 같은 행이 갱신되는 대신 새 행이 생기고 옛 행이 남는다(실측: 초기
-- 적재에서 휴장일 역산이 틀리자 만기일이 통째로 밀려 유령 행이 쌓였다).
-- event_key 는 연·월을 품은 결정적 키라 그 자체로 고유하다.
drop index if exists market_calendar_key_uniq;
create unique index if not exists market_calendar_event_key_uniq
  on market_calendar (event_key);
create index if not exists market_calendar_date_idx
  on market_calendar (date);
create index if not exists market_calendar_kind_date_idx
  on market_calendar (kind, date);
create index if not exists market_calendar_instrument_idx
  on market_calendar (instrument_id, date)
  where instrument_id is not null;

-- RLS: 공개 시장데이터 — anon 읽기 허용(0008·0021 패턴). 쓰기는 service_role(RLS 우회).
alter table market_calendar enable row level security;

drop policy if exists market_calendar_anon_read on market_calendar;
create policy market_calendar_anon_read on market_calendar
  for select to anon, authenticated using (true);

comment on column market_calendar.event_key is
  '결정적 자연키. 예: kr-holiday-2026-08-15, expiry-quad-2026-09-10.';
comment on column market_calendar.block_entry is
  'true 면 D-block_days_before ~ D0 에 신규 진입 픽 발행을 막는다.';
