"""픽(daily_focus) 트랙레코드 진단 — 실제 성과가 얼마나 저조한지, 분포·셋업/스타일별로."""
from engine.config import get_settings
import psycopg

dsn = get_settings().supabase_db_url
if not dsn:
    raise SystemExit("SUPABASE_DB_URL 미설정 (.env.local 확인)")

with psycopg.connect(dsn) as conn, conn.cursor() as cur:
    # 0) 컬럼 확인
    cur.execute("""
        select column_name from information_schema.columns
        where table_name='recommendations' order by ordinal_position
    """)
    cols = [r[0] for r in cur.fetchall()]
    print("=== recommendations 컬럼 ===")
    print(", ".join(cols))

    has = lambda c: c in cols
    setup_col = "setup" if has("setup") else ("playbook" if has("playbook") else None)
    style_col = "style" if has("style") else None

    # 1) 상태별 개수 + 평균/중앙 수익률
    print("\n=== daily_focus 상태별 (전체 기간) ===")
    cur.execute("""
        select status, count(*),
               round(avg(close_return_pct)::numeric*100, 2) as avg_ret_pct,
               round((percentile_cont(0.5) within group (order by close_return_pct))::numeric*100, 2) as med_ret_pct
        from recommendations
        where basket_type='daily_focus'
        group by status order by count(*) desc
    """)
    for st, n, avg, med in cur.fetchall():
        print(f"  {str(st):10} n={n:4}  avg={avg}%  median={med}%")

    # 2) 종결 픽만: 승률·기대수익
    print("\n=== 종결 픽(target/partial/stopped/expired) 요약 ===")
    cur.execute("""
        with closed as (
          select status, close_return_pct r
          from recommendations
          where basket_type='daily_focus' and status in ('target','partial','stopped','expired')
            and close_return_pct is not null
        )
        select count(*) n,
               round(avg(r)::numeric*100,2) avg_pct,
               round((100.0*sum((r>0)::int)/count(*))::numeric,1) winrate_pct,
               round((100.0*sum((status='target' or status='partial')::int)/count(*))::numeric,1) target_share_pct,
               round((100.0*sum((status='stopped')::int)/count(*))::numeric,1) stop_share_pct,
               round((100.0*sum((status='expired')::int)/count(*))::numeric,1) expire_share_pct,
               round(min(r)::numeric*100,2) worst, round(max(r)::numeric*100,2) best
        from closed
    """)
    row = cur.fetchone()
    if row and row[0]:
        n, avg, wr, ts, ss, es, wo, be = row
        print(f"  종결 n={n}  평균수익={avg}%  승률={wr}%")
        print(f"  목표달성 {ts}% / 손절 {ss}% / 만료 {es}%   (최악 {wo}% ~ 최고 {be}%)")
    else:
        print("  종결 픽 없음")

    # 3) 최근 60일 vs 전체 (최근 성과)
    print("\n=== 최근 60일 발행 픽 종결 요약 ===")
    cur.execute("""
        select count(*) ,
               round(avg(close_return_pct)::numeric*100,2),
               round((100.0*sum((close_return_pct>0)::int)/nullif(count(*),0))::numeric,1)
        from recommendations
        where basket_type='daily_focus' and status in ('target','partial','stopped','expired')
          and close_return_pct is not null and as_of >= current_date - 60
    """)
    n, avg, wr = cur.fetchone()
    print(f"  n={n}  평균={avg}%  승률={wr}%")

    # 4) 셋업/스타일별 (컬럼 있으면)
    for label, col in [("셋업", setup_col), ("스타일", style_col)]:
        if not col:
            print(f"\n(=== {label}별: {col} 컬럼 없음 — 스킵)")
            continue
        print(f"\n=== {label}({col})별 종결 요약 ===")
        cur.execute(f"""
            select {col}, count(*),
                   round(avg(close_return_pct)::numeric*100,2),
                   round((100.0*sum((close_return_pct>0)::int)/nullif(count(*),0))::numeric,1)
            from recommendations
            where basket_type='daily_focus' and status in ('target','partial','stopped','expired')
              and close_return_pct is not null
            group by {col} order by count(*) desc
        """)
        for v, n, avg, wr in cur.fetchall():
            print(f"  {str(v):16} n={n:4}  평균={avg}%  승률={wr}%")

    # 5) 보유기간(종결까지 일수) 분포
    print("\n=== 종결까지 보유일수 ===")
    cur.execute("""
        select status,
               round(avg((closed_at::date - as_of::date))::numeric,1) avg_days
        from recommendations
        where basket_type='daily_focus' and status in ('target','partial','stopped','expired')
          and closed_at is not null
        group by status order by status
    """)
    for st, d in cur.fetchall():
        print(f"  {str(st):10} 평균 {d}일")
