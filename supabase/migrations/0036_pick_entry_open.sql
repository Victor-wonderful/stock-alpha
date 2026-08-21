-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0036 — 픽 진입을 «다음 거래일 시가»로 (entry_rule = next_open)   ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 왜: 게이트는 «신호가에 무조건 체결»을 가정해 기대값을 재는데 라이브 발행은
-- 전일 종가 지정가였다. 오르는 종목은 갭업해 도망가고 내리는 종목만 체결되는
-- 역선택이 걸려, 13조합 전수 비교에서 라이브 기준 기대값이 전부 하락하고 5개는
-- 음수였다. 다음 거래일 시가 진입(open)은 갭업분을 지불하는 대신 반드시 체결돼
-- 평균 기대값 +0.087 → +0.156, 음수 조합 5 → 0 이 된다.
--
-- 무엇이 바뀌나: 픽은 이제 «두 단계»를 산다.
--   ① 발행(D일 16:30)  status='pending' — 다음날 시가를 모르므로 entry/stop/tp 는
--      그날 종가 기준 «예상»이다. 화면도 예상이라고 말한다.
--   ② 확정(D+1 16:30)  status='open'    — 실제 시가로 레벨을 다시 계산해 덮어쓴다.
--      백테스트 open 모드가 정확히 이렇게 한다(event_backtest: 시가로 compute_levels
--      재실행). 근사로 옮기면 이번 사달의 원인이었던 «게이트와 발행의 미세한 불일치»를
--      되풀이하게 되므로, 재계산 입력(atr·지지·저항)을 픽에 남겨 그대로 다시 돈다.
--
-- 기존 픽은 건드리지 않는다 — entry_rule 기본값 'limit' 로 남아 옛 판정 경로
-- (지정가 체결 확인 → unfilled)를 그대로 탄다. 이미 발행한 계획을 소급해 바꾸면
-- 트랙레코드가 거짓말이 된다.

alter table recommendations
  -- 진입 규칙. 'limit' = 전일 종가 지정가(2026-08-21 이전 발행분),
  --            'next_open' = 다음 거래일 시가 시장가(이후 발행분).
  add column if not exists entry_rule text not null default 'limit',

  -- 레벨 재계산 입력 + 발행 시 예상값 보존.
  -- {atr, support, resistance, risk_pct, planned_entry, planned_stop,
  --  planned_tp1, planned_tp2}
  -- 예상값을 남기는 이유: 확정가로 덮어쓰고 나면 "발행 때 뭐라고 했는지"를
  -- 되짚을 수 없다. 갭이 컸던 날을 사후에 설명하려면 둘 다 있어야 한다.
  add column if not exists plan_payload jsonb,

  -- 시가로 레벨을 확정한 거래일. pending 인 동안 null.
  add column if not exists confirmed_at date;

comment on column recommendations.entry_rule is
  'limit=전일 종가 지정가(옛 픽) | next_open=다음 거래일 시가 시장가';
comment on column recommendations.plan_payload is
  'next_open 픽의 레벨 재계산 입력(atr·support·resistance·risk_pct)과 발행 시 예상 레벨';
comment on column recommendations.confirmed_at is
  '시가로 진입가·레벨을 확정한 거래일 (pending 동안 null)';

-- status 는 여전히 자유 텍스트다. 값 목록:
--   pending(진입 대기 — next_open 발행 직후) | open(진입 확정, 보유 중)
--   target | stopped | expired | unfilled(옛 limit 픽 전용, 끝내 못 산 것)
create index if not exists recommendations_pending_idx
  on recommendations (basket_type, status)
  where status = 'pending';
