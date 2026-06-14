-- 0021 — 기업 공시 이벤트 피드 (DART list.json 분류 저장)
-- 이벤트 드리븐 알파: 분류된 공시 이벤트만 적재(정기/미분류 제외).
-- 발행은 이벤트 스터디(CAR·비용반영 게이트) 통과 타입만.

create table if not exists disclosures (
  id            bigint generated always as identity primary key,
  instrument_id bigint references instruments(id) on delete cascade,
  rcept_no      text not null unique,              -- DART 접수번호(자연키)
  corp_code     text,
  report_nm     text not null,                     -- 보고서명(원문)
  event_type    text not null,                     -- 분류 이벤트 타입
  direction     text,                              -- positive/negative/neutral (가설)
  rcept_dt      date not null,                     -- 접수일(이벤트 기준일)
  raw           jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists disclosures_instrument_dt_idx
  on disclosures (instrument_id, rcept_dt desc);
create index if not exists disclosures_event_dt_idx
  on disclosures (event_type, rcept_dt desc);

-- RLS: 공개 시장데이터 — anon 읽기 허용(0008 패턴). 쓰기는 service_role 만(RLS 우회).
alter table disclosures enable row level security;

drop policy if exists disclosures_anon_read on disclosures;
create policy disclosures_anon_read on disclosures
  for select to anon, authenticated using (true);
