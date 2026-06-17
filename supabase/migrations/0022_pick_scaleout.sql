-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0022 — 픽 분할익절(스케일아웃) 수명주기                          ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 처방2-2: tp1 에서 50% 익절 + 잔량 본전(entry)스톱 후 tp2 런.
-- diag_scaleout 검증: 7개 중 6개 셋업 net 기대값↑(되돌림은 본전스톱이 방어,
-- 추세 연장은 런이 tp2 까지 포착). 게이트(event_backtest scaleout)와 동일 규칙.
--
-- 전환 경계: tp2_price 가 있는 픽만 스케일아웃 상태기계를 탄다. 이전 픽(tp2 NULL)은
-- 기존 단일 tp1 청산 유지 → 진행 중 픽의 판정이 소급 변경되지 않는다.

alter table recommendations
  add column if not exists tp2_price numeric(20,4),     -- 2차 목표(잔량 런 목표)
  add column if not exists tp1_hit   boolean not null default false,  -- 1차 익절 도달
  add column if not exists tp1_hit_at date;             -- 1차 익절일

-- status 에 'partial'(1차 익절 후 본전 청산) 추가. status 는 text(제약 없음, 0017)
-- 라 별도 제약 변경 불필요 — 값 집합: open|target|stopped|expired|partial.
