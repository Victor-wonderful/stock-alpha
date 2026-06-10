-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0018 — 신규 플레이북 셋업 4종 (전문가 제안 Tier 1)               ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06-10): 알파 원천 다변화 — 기존 3종(전부 추세 추종)에
--   수급(flow_accumulation)·조정 매수(pullback)·장기 모멘텀(high_52w)·
--   변동성 구조(vol_squeeze) 추가. 게이트 통과 전까지 발행되지 않음.

alter type trade_setup add value if not exists 'flow_accumulation';  -- 수급 동반 매집
alter type trade_setup add value if not exists 'pullback';           -- 눌림목
alter type trade_setup add value if not exists 'high_52w';           -- 52주 신고가
alter type trade_setup add value if not exists 'vol_squeeze';        -- 변동성 수축 돌파
