-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0013 — sector_rotation 파생 테이블 (섹터 로테이션)              ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06): 섹터별 상대 모멘텀·수급을 엔진이 집계해 저장, 웹은 읽기만.
--   instruments.sector(DART 기업개황 KSIC 분류로 적재) 기준 그룹 집계.
--   공개 시장데이터 → 0006/0008 과 동일 read 정책(write 무).

create table sector_rotation (
  date      date not null,
  sector    text not null,
  momentum  numeric(10,4),                 -- 섹터 평균 모멘텀 z (상대강도)
  flow      numeric(20,2),                 -- 외인+기관 순매수(억원, 최근 5거래일 합)
  n_stocks  integer,                       -- 집계 종목 수
  source_version text,
  created_at timestamptz not null default now(),
  primary key (date, sector)
);
create index on sector_rotation (date);

alter table sector_rotation enable row level security;
create policy sector_rotation_read on sector_rotation
  for select to authenticated using (true);
create policy sector_rotation_read_anon on sector_rotation
  for select to anon using (true);
