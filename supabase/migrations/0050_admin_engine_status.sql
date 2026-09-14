-- 0050 관리 대시보드의 «엔진 상태판» — 운영자만.
--
-- 2026-09-14 Victor: "관리자 페이지 대시보드가 이렇게 밖에 안되나?"
--
-- ## 무엇을 답하나
--
-- 엔진이 어젯밤 제대로 돌았는지를 **DB 에 남은 흔적**으로 판정한다. 배치 로그는
-- 운영 PC 의 파일이라 웹에서 못 읽고, 8/27 에 배치가 사흘 연속 죽었을 때 아무도
-- 몰랐다. 산출물마다 «가장 최근 날짜»와 «그날 건수»를 돌려주면, 화면이 기준일
-- (마지막 거래일 = 시세의 최신일)과 견줘 «정상 / 지연 / 멈춤»을 매긴다.
--
-- 판정은 DB 가 하지 않는다 — 몇 거래일 늦으면 «멈춤»인지는 화면 쪽 규칙이고,
-- 거래일 계산(휴장일)은 웹이 이미 갖고 있다(lib/data getTradingCalendar).
--
-- ## 왜 함수인가
--
-- 0049 와 같은 이유 — 운영자인지 확인한 뒤에만 답한다. 여기 있는 표들은 대부분
-- 회원에게도 읽기가 열려 있지만, pg_database_size 는 그렇지 않고, 표 여덟 개를
-- 웹이 따로따로 묻는 것보다 한 번에 받는 편이 관리 홈을 가볍게 한다.
--
-- ## 시세 표의 인덱스
--
-- ohlcv 는 150만 행이고 (instrument_id, interval, ts) 로만 인덱스가 있어
-- «가장 최근 ts» 를 물으면 전체를 훑는다. (interval, ts) 인덱스를 하나 더 둔다 —
-- «오늘 몇 종목 들어왔나»도 같은 인덱스로 즉시 답한다.

create index if not exists ohlcv_interval_ts_idx on ohlcv (interval, ts desc);

create or replace function admin_engine_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ohlcv_ts timestamptz;
  v_out jsonb;
begin
  if not is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select max(ts) into v_ohlcv_ts from ohlcv where interval = '1d';

  select jsonb_build_object(
    'ohlcv', jsonb_build_object(
      'latest', (v_ohlcv_ts at time zone 'Asia/Seoul')::date,
      'n', (select count(*) from ohlcv where interval = '1d' and ts = v_ohlcv_ts)
    ),
    'factor_scores', (
      select jsonb_build_object('latest', d, 'n', (select count(*) from factor_scores where date = d))
      from (select max(date) d from factor_scores) m
    ),
    'valuations', (
      select jsonb_build_object('latest', d, 'n', (select count(*) from valuations where date = d))
      from (select max(date) d from valuations) m
    ),
    'risk_metrics', (
      select jsonb_build_object('latest', d, 'n', (select count(*) from risk_metrics where date = d))
      from (select max(date) d from risk_metrics) m
    ),
    -- signals 에는 날짜 열이 없다 — 만든 시각(created_at)을 KST 날짜로 접는다.
    'signals', (
      select jsonb_build_object(
        'latest', d,
        'n', (select count(*) from signals where (created_at at time zone 'Asia/Seoul')::date = d)
      )
      from (select (max(created_at) at time zone 'Asia/Seoul')::date d from signals) m
    ),
    'market_regime', (
      select jsonb_build_object('latest', d, 'n', 1)
      from (select max(date) d from market_regime) m
    ),
    'daily_focus', (
      select jsonb_build_object(
        'latest', d,
        'n', (select count(*) from recommendations where basket_type = 'daily_focus' and as_of = d)
      )
      from (select max(as_of) d from recommendations where basket_type = 'daily_focus') m
    ),
    'reports', (
      select jsonb_build_object('latest', d, 'n', (select count(*) from reports where as_of = d))
      from (select max(as_of) d from reports) m
    ),
    'disclosures', (
      select jsonb_build_object('latest', d, 'n', (select count(*) from disclosures where rcept_dt = d))
      from (select max(rcept_dt) d from disclosures) m
    ),
    'blog_posts', (
      select jsonb_build_object(
        'latest', d,
        'n', (select count(*) from blog_posts where author_kind = 'engine' and published_at = d)
      )
      from (select max(published_at) d from blog_posts where author_kind = 'engine') m
    ),
    'db_bytes', pg_database_size(current_database()),
    'ohlcv_bytes', pg_total_relation_size('ohlcv')
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function admin_engine_status() from public;
grant execute on function admin_engine_status() to authenticated;
