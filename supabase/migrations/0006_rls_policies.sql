-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0006 — RLS 정책                                                 ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 원칙:
--  · 엔진(워커)은 service_role 키로 접속 → RLS 우회하여 write.
--  · 분석/시장 데이터: 인증 사용자 read-only. (티어별 실시간성·심도 차등은
--    BFF/서버 레이어에서 추가 적용 — 예: free 는 지연/요약만 노출.)
--  · 사용자 소유 데이터: 본인 행만.
--  · broker_credentials 평문 키는 어떤 경로로도 클라이언트 미노출(서버만 복호화).

-- ── 분석/시장 데이터: 인증 사용자 read-only ──
do $$
declare t text;
begin
  foreach t in array array[
    'instruments','ohlcv','ticks','orderbook','flows',
    'financials','estimates','valuations','macro','news',
    'factor_scores','signals','recommendations','backtests'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for select to authenticated using (true);',
      t || '_read', t
    );
    -- write 정책 없음 → service_role 만 가능(RLS 우회)
  end loop;
end $$;

-- ── reports: non-custom 은 인증 사용자 read, custom 은 본인만 ──
alter table reports enable row level security;
create policy reports_read_shared on reports
  for select to authenticated
  using (report_type <> 'custom');
create policy reports_read_own on reports
  for select to authenticated
  using (user_id = auth.uid());

-- ── 사용자 소유 테이블: 본인 행만 (CRUD) ──
-- profiles
alter table profiles enable row level security;
create policy profiles_select on profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 헬퍼 매크로 없이 테이블별 정책 (user_id 컬럼 기준)
do $$
declare t text;
begin
  foreach t in array array[
    'subscriptions','watchlists','alerts','report_subscriptions',
    'bot_configs','executions','positions'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy %I on %I for select to authenticated using (user_id = auth.uid());', t||'_sel', t);
    execute format('create policy %I on %I for insert to authenticated with check (user_id = auth.uid());', t||'_ins', t);
    execute format('create policy %I on %I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());', t||'_upd', t);
    execute format('create policy %I on %I for delete to authenticated using (user_id = auth.uid());', t||'_del', t);
  end loop;
end $$;

-- ── broker_credentials: RLS 활성화하되 클라이언트엔 정책 부여 안 함 ──
-- (select/insert/update 정책 전무 → service_role(서버/워커)만 접근. 평문 키 절대 미노출)
alter table broker_credentials enable row level security;
-- 사용자가 자기 키 "존재 여부"만 확인할 수 있는 별도 안전 뷰는 추후 필요 시 추가.
