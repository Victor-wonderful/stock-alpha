-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0025 — 통계 전략 셋업 5종 (피봇·메디안 통과 / 델타·마르코프·콴타일 보류) ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06-24): luckybot 멀티전략 2차 이식 — 백테스트 게이트로 검증.
--   pivot : 검증 통과 — swing 승률 62%, 기대값 +0.147R. 피봇 R1 상향 돌파.
--   median: 검증 통과 — position 기대값 +0.281R(기존 leader_trend +0.236 능가).
--           이동중앙값(이상치 강건) 상회·상승 + 장기추세.
--   delta(AR1)·markov(레짐)·quantile(분위 반등): 워크포워드 불안정으로 보류.
--   enum 값은 backtests.setup 기록(게이트 평가)에도 필요 → 5종 모두 추가.
--   통과 전까지 발행 안 됨(게이트).

alter type trade_setup add value if not exists 'pivot';     -- 피봇 R1 돌파
alter type trade_setup add value if not exists 'median';    -- 이동중앙값 강건 추세
alter type trade_setup add value if not exists 'delta';     -- AR(1) 모멘텀 지속
alter type trade_setup add value if not exists 'markov';    -- 상승 레짐 지속확률
alter type trade_setup add value if not exists 'quantile';  -- 분위수 과매도 반등
