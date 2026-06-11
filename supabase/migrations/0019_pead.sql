-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0019 — PEAD(실적 모멘텀) 셋업 + 재무 공시일                      ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06-11): 분기 재무 확보로 어닝 서프라이즈 기반 PEAD 가능.
--   point-in-time 정직성: 공시일(disclosed_at, DART rcept_no 앞 8자리)
--   이후에만 시그널/백테스트 트리거. 게이트 통과 전까지 발행되지 않음.

alter type trade_setup add value if not exists 'pead';  -- 실적 모멘텀(PEAD)

alter table financials add column if not exists disclosed_at date;  -- DART 접수일
