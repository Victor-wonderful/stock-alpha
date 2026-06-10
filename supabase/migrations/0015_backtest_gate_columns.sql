-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0015 — backtests 게이트 판정 저장 (expectancy_r · passed)       ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06-10): 게이트 재캘리브레이션 — 승률/손익비 개별 하한 폐지,
--   기대값(R) 하한으로 통합. MDD 는 R 곡선(트레이드당 리스크 1%) 기준.
--   판정(passed)은 엔진이 계산해 저장하고 웹·리포트는 읽기만 한다
--   (기존엔 웹이 자체 휴리스틱으로 재계산 — 기준 이원화 제거).

alter table backtests
  add column if not exists expectancy_r numeric(10,4),
  add column if not exists passed boolean;
