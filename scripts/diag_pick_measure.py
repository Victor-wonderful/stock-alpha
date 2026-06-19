"""픽 판정 방식의 측정 편향 검증 — 종가판정이 손실을 과장/승리를 누락하는가."""
from engine.config import get_settings
import psycopg

dsn = get_settings().supabase_db_url

with psycopg.connect(dsn) as conn, conn.cursor() as cur:
    # 1) 손절픽: 계획 손절폭(stop/entry-1) vs 실제 기록 손실(close_return_pct)
    print("=== 손절픽: 계획 손절가 대비 실제 기록 손실(종가 오버슈트) ===")
    cur.execute("""
        select count(*),
               round(avg(stop_loss/entry_price - 1)::numeric*100,2) planned_stop_pct,
               round(avg(close_return_pct)::numeric*100,2) realized_pct,
               sum((close_return_pct < (stop_loss/entry_price - 1) - 0.005)::int) overshot_n
        from recommendations
        where basket_type='daily_focus' and status='stopped'
          and entry_price>0 and stop_loss is not null and close_return_pct is not null
    """)
    n, planned, realized, overshot = cur.fetchone()
    print(f"  손절 n={n}")
    print(f"  계획 손절폭 평균 = {planned}%   실제 기록 손실 평균 = {realized}%")
    print(f"  계획보다 더 깊게(>0.5%p) 기록된(갭/종가오버슈트) 건수 = {overshot}/{n}")
    if planned and realized:
        print(f"  → 오버슈트 갭 ≈ {round(float(realized)-float(planned),2)}%p (이만큼 손실이 과장됨)")

    # 2) 열린 픽: 장중 고가/저가가 이미 목표·손절을 터치했는가(종가판정이 놓친 것)
    print("\n=== 열린 픽: 장중 고가/저가 기준 이미 목표/손절 도달했는데 'open'인 건수 ===")
    cur.execute("""
        with op as (
          select id, instrument_id, as_of, entry_price, target_price, tp2_price, stop_loss
          from recommendations
          where basket_type='daily_focus' and status='open' and entry_price>0
        ),
        bars as (
          select o.id, max(k.high) mh, min(k.low) ml, count(*) nbars
          from op o
          join ohlcv k on k.instrument_id=o.instrument_id and k.interval='1d'
                       and k.ts::date >= o.as_of::date
          group by o.id
        )
        select count(*) total,
               sum((mh >= target_price)::int) hit_tp1_intraday,
               sum((ml <= stop_loss)::int) hit_stop_intraday,
               round(avg(nbars)::numeric,1) avg_bars
        from op join bars using(id)
    """)
    total, tp_hit, stop_hit, avg_bars = cur.fetchone()
    print(f"  열린 픽(바 있음) n={total}  (평균 {avg_bars}봉 경과)")
    print(f"  장중 고가가 이미 1차목표 도달 = {tp_hit}건  ← 종가판정이 미반영(승리 누락 가능)")
    print(f"  장중 저가가 이미 손절 도달    = {stop_hit}건  ← 종가판정이 미반영")

    # 3) 종결 픽: 실제 R 분포(손절폭 1R 기준) — 기대값 관점
    print("\n=== 종결 픽 R 환산(손익/계획손절폭) ===")
    cur.execute("""
        with c as (
          select status, close_return_pct r, abs(stop_loss/entry_price - 1) risk
          from recommendations
          where basket_type='daily_focus' and status in ('target','partial','stopped','expired')
            and entry_price>0 and stop_loss is not null and close_return_pct is not null
            and stop_loss/entry_price - 1 < 0
        )
        select count(*), round(avg(r/risk)::numeric,3) avg_R, round(sum(r/risk)::numeric,2) total_R
        from c
    """)
    n, avgR, totR = cur.fetchone()
    print(f"  n={n}  평균 R = {avgR}  누적 R = {totR}")
    print("  (백테스트 게이트 통과 기준은 기대값 ≥ +0.05R — 라이브가 이보다 크게 낮으면 측정/레짐 문제 의심)")
