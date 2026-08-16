-- 0032 — 캘린더 이벤트의 실측 반응
--
-- 0031 로 "언제 무슨 일정이 있는지"는 알게 됐다. 그런데 화면에 일정 이름만 띄우는 건
-- 정보가 아니다 — 사용자가 묻는 건 "그래서 나한테 무슨 영향인데?"이고, 그 답은
-- 통념이 아니라 우리 데이터에서 나와야 한다.
--
-- 실제로 재보니 통념이 틀렸다(2026-08-16, 442거래일):
--   전체 평균   종목간 산포 4.10%
--   동시만기(7) 종목간 산포 3.05%  ← 평소보다 조용하다
--   옵션만기(22) 3.15% · 지수변경(4) 3.42% · NFP 다음날(32) 3.34%
-- 그래서 '동시만기 신규진입 차단' 규칙은 근거 없이 픽만 깎는 규칙이라 껐다.
-- 이 표는 그 판단의 근거를 화면과 코드가 같이 보게 만든다.
--
-- 산포(dispersion) = 그날 전 종목 일간수익률의 표준편차. 지수가 안 움직여도 종목이
-- 서로 반대로 튀면 커진다. 우리는 지수가 아니라 개별 픽을 들고 있으므로 지수 등락보다
-- 이 값이 실제 위험에 가깝다.

create table if not exists calendar_impact (
  kind            text not null,          -- market_calendar.kind
  region          text not null default 'KR',
  offset_days     smallint not null default 0,   -- 0=당일, 1=다음 거래일(밤사이 발표용)
  n               integer not null,       -- 표본 수 — 작으면 화면이 그렇게 말해야 한다
  dispersion      numeric(10,6),          -- 이벤트일 종목간 산포
  base_dispersion numeric(10,6),          -- 같은 기간 전체 평균 산포(비교 기준)
  intraday_range  numeric(10,6),          -- 이벤트일 평균 일중 변동폭
  base_range      numeric(10,6),
  mean_return     numeric(10,6),          -- 이벤트일 동일가중 평균 등락
  base_return     numeric(10,6),
  window_start    date,
  window_end      date,
  source_version  text,
  measured_at     timestamptz not null default now(),
  primary key (kind, region, offset_days)
);

alter table calendar_impact enable row level security;

drop policy if exists calendar_impact_anon_read on calendar_impact;
create policy calendar_impact_anon_read on calendar_impact
  for select to anon, authenticated using (true);

comment on table calendar_impact is
  '캘린더 이벤트 종류별 실측 반응. 통념이 아니라 우리 일봉에서 계산한다.';
comment on column calendar_impact.dispersion is
  '이벤트일 전 종목 일간수익률 표준편차. base_dispersion 보다 작으면 평소보다 조용한 날.';
