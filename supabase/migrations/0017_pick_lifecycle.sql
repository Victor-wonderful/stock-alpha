-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0017 — 픽 수명주기 (오늘의 포커스 상태 관리)                     ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 갭 프레임 [관리]: 픽은 발행으로 끝나지 않는다 — 일일 배치가 종가 기준으로
-- 목표도달/손절/만료를 확정 기록한다(읽기 시점 추정이 아닌 영구 기록 = 트랙레코드).

alter table recommendations
  add column if not exists status text not null default 'open',
    -- open | target(목표 도달) | stopped(손절) | expired(기간 만료)
  add column if not exists closed_at date,
  add column if not exists exit_price numeric(20,4),
  add column if not exists close_return_pct numeric(10,4);

create index if not exists recommendations_status_idx
  on recommendations (basket_type, status);
