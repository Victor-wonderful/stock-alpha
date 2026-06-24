-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0027 — 베이즈·소르티노 셋업 — 검증 통과                          ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06-24): luckybot 'Bayes/Sortino' 이식 — 백테스트 게이트 통과.
--   sortino: 하방위험 조정 모멘텀. 기대값 +0.213R.
--   bayes  : OHLCV 다중 증거 베이지안 결합(사후확률). 기대값 +0.199R, MDD 9%
--            (주도주추세 11%보다 낮음). factor_scores 이력(15일)이 짧아 팩터판은
--            보류 — OHLCV 증거판으로 검증·발행. 이력 축적 후 factor 주입판 확장.

alter type trade_setup add value if not exists 'sortino';  -- 하방조정 모멘텀
alter type trade_setup add value if not exists 'bayes';    -- 베이지안 증거 결합
