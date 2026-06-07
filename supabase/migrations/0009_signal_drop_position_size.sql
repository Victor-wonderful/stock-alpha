-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0009 — signals.position_size_pct 제거 (사용자 차원 분리)         ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 원칙(CLAUDE.md): 시그널은 사용자 무관 값만 저장(진입/손절/TP/R:R).
--   권장 비중(position_size_pct)은 사용자 risk_per_trade_pct 에 의존하므로
--   공유 시그널에 박지 않고 읽기 시점에 entry/stop + 사용자 리스크로 계산한다.
--   (웹: lib/position.ts, profiles.risk_per_trade_pct 사용)

alter table signals drop column if exists position_size_pct;
