-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0008 — 공개 시장데이터 anon read                                ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06): 분석/시장 데이터는 비로그인(anon) 방문자에게도 read 허용 —
--   제품의 '쇼윈도'. Free/Pro 차등(지연·요약 vs 실시간·심층)은 RLS가 아니라
--   BFF/서버 레이어(lib/data.ts)에서 적용한다. 0006 의 authenticated read 정책은
--   그대로 두고, anon 용 read 정책을 동일 조건(using true)으로 추가한다.
--   write 정책은 여전히 전무 → service_role(엔진/워커)만 기록.
--   사용자 소유 테이블·broker_credentials 는 변경 없음(본인/서버 전용 유지).

do $$
declare t text;
begin
  foreach t in array array[
    'instruments','ohlcv','ticks','orderbook','flows',
    'financials','estimates','valuations','macro','news',
    'factor_scores','signals','recommendations','backtests'
  ]
  loop
    execute format(
      'create policy %I on %I for select to anon using (true);',
      t || '_read_anon', t
    );
  end loop;
end $$;

-- reports: 공유(non-custom)만 anon read. custom 은 본인(authenticated)만 — 0006 유지.
create policy reports_read_shared_anon on reports
  for select to anon
  using (report_type <> 'custom');
