-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0011 — risk_metrics 파생 테이블 (베타·변동성·VaR·MDD)            ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06): 종목 리스크 지표는 엔진(파이썬)이 OHLCV 로 계산해 저장하고
--   웹은 읽기만 한다(CLAUDE.md: 모든 수치는 코드가 계산). 그동안 웹 getRisk 가
--   샘플을 반환해 종목상세에 "예시 데이터" 배지가 남던 빈틈을 해소한다.
--   factor_exposure(시장/사이즈/밸류/모멘텀)는 factor_scores + beta 로 웹이 조립.
--   공개 시장데이터이므로 0006/0008 과 동일하게 authenticated·anon read 만(write 무).

create table risk_metrics (
  instrument_id  bigint not null references instruments(id) on delete cascade,
  date           date not null,
  beta           numeric(10,4),                 -- 시장(유니버스 동일가중) 대비 베타
  vol_annual     numeric(10,6),                 -- 연율 변동성(일수익 std × √252)
  var_95         numeric(10,6),                 -- 1일 95% VaR(역사적 5퍼센타일, 음수)
  max_drawdown   numeric(10,6),                 -- 기간 최대낙폭(음수)
  source_version text,
  created_at     timestamptz not null default now(),
  primary key (instrument_id, date)
);
create index on risk_metrics (date);

-- RLS: 인증·비로그인 read 허용, write 정책 없음(service_role 만 기록).
alter table risk_metrics enable row level security;
create policy risk_metrics_read on risk_metrics
  for select to authenticated using (true);
create policy risk_metrics_read_anon on risk_metrics
  for select to anon using (true);
