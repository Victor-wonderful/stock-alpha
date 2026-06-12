-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0020 — 게이트 히스테리시스: backtests.passed_raw 추가          ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 문제(2026-06-12): 경계선 셋업(oversold_bounce·close_betting)이 데이터가
-- 하루 추가될 때마다 PASS/FAIL 을 오가며 발행 일관성을 해침.
-- 해결: passed = 안정화 판정(2회 연속 같은 측정일 때만 상태 변경, 기존 소비자
-- 무수정), passed_raw = 해당 런의 원측정값(투명성·진단용).

alter table backtests add column if not exists passed_raw boolean;

-- 기존 행 백필 — 과거 런은 원측정=판정
update backtests set passed_raw = passed where passed_raw is null;
