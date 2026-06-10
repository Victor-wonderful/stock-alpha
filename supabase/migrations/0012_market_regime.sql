-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0012 — market_regime 파생 테이블 (시장 국면)                     ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06): 시장 레짐(위험선호/회피)은 엔진이 보유 데이터(시장 모멘텀·
--   브레드스·외국인 수급)로 산출해 저장, 웹은 읽기만(CLAUDE.md). 그동안 시장
--   페이지가 샘플 레짐을 쓰던 빈틈을 해소한다.
--   섹터로테이션은 instruments.sector 가 비어(인제스트 미수집) 보류,
--   macro 시리즈는 FRED/ECOS 외부 소스 필요 → 둘은 별도 작업.
--   공개 시장데이터이므로 0006/0008 과 동일 read 정책(write 무).

create table market_regime (
  date           date primary key,
  regime         text not null,                 -- risk_on | neutral | risk_off
  score          numeric(6,4) not null,         -- -1(위험회피) ~ 1(위험선호)
  drivers        jsonb not null default '[]',   -- 주요 동인 문자열 배열
  source_version text,
  created_at     timestamptz not null default now()
);

alter table market_regime enable row level security;
create policy market_regime_read on market_regime
  for select to authenticated using (true);
create policy market_regime_read_anon on market_regime
  for select to anon using (true);
