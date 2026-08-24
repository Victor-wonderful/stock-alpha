-- 0048 발행일 목록 — 「분석」 화면의 날짜 이동.
--
-- 2026-08-25: 「분석」이 한 번에 400건을 긁어 3일치를 한 장에 쌓고 있었다. 실제로는
-- **42개 발행일 × 하루 100건**(전체 4,493건)이라 나머지 39일은 화면에서 갈 길이 없었다.
-- 날짜를 페이지로 쓰기로 했고, 그러려면 «리포트가 나온 날들»이 필요하다.
--
-- 왜 웹에서 못 하나: PostgREST 에는 distinct 가 없다. 날짜만 받아 메모리에서 접으려면
-- 42일 × 100건 = 4,200 행을 받아야 하는데 **이 프로젝트의 REST 응답은 1000행에서
-- 잘린다**(알려진 함정). 그러면 최근 10일만 나오고 나머지는 다시 «없는 것»이 된다.
--
-- 거래 부적합만 있는 날도 포함한다 — 그날 분석을 돌렸다는 뜻이고, 화면은 「거래 부적합
-- 보이기」로 그날을 열어 볼 수 있어야 한다.
create or replace function report_days(p_limit int default 120)
returns table (as_of date, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select r.as_of, count(*) as n
    from reports r
   where r.status = 'published'
     and r.report_type = 'indepth'
   group by r.as_of
   order by r.as_of desc
   limit greatest(p_limit, 1);
$$;

revoke all on function report_days(int) from public;
grant execute on function report_days(int) to anon, authenticated;
