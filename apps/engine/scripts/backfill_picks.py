"""백필: 배치가 멈춰 픽이 안 나간 과거 거래일을 그날 근거로 되메운다.

배경(2026-08-16) — 6/10~8/14 사이 22 거래일에 daily_focus 픽이 0건이었다. 리포트·
백테스트는 돌았는데 픽 선정만 빠진 날, 그리고 배치 자체가 안 돈 날이 섞여 있다.
트랙레코드가 끊기면 "좋을 때만 발행했다"와 구분이 안 된다.

되메울 수 있는 날의 조건: 그날 indepth 리포트가 남아 있어야 한다(픽은 리포트의
plan payload 에서 고른다). 리포트 0~1건인 날은 근거 자체가 없어 백필 불가다.

시점 정합성 — 백필은 '그때 알 수 있었던 것만' 써야 한다. 안 그러면 나중에 좋아진
걸 알고 고른 셈이라 트랙레코드가 오히려 거짓말이 된다. 세 경로를 as_of 로 잘랐다:
  · 종가 맵      _latest_close_map(as_of)        — 진입가 실행가능성
  · 게이트       passed_combos_from_db(as_of)    — 그날까지 적재된 백테스트만
  · 기대값       gate_expectancy_from_db(as_of)  — 위와 동일
  · 보유 상태    _open_instrument_ids(as_of)     — 그날 이미 들고 있던 종목 제외
레짐(market_regime)·캘린더는 원래부터 as_of 기준이라 그대로 쓴다.

남는 한계 — 리포트 payload 안의 plan(진입/손절/목표)은 **당시 코드**가 계산한 값이라
구조 손절 상한(levels.py, 8/14~16 도입) 이전 값이다. 그래서 손절 -47% 같은 플랜이
payload 에 그대로 있다. 이건 select_picks 의 발행 게이트(_stop_width_ok·_rr_ok)가
걸러낸다 — 발행 시점에 걸렀어야 할 것을 지금 거르는 것이라 시점 정합성을 깨지 않는다.

실행 (apps/engine 에서):
    python -m scripts.backfill_picks                      # 대상일 조사만
    python -m scripts.backfill_picks --apply              # 되메우기
    python -m scripts.backfill_picks --apply --from 2026-07-20 --to 2026-07-23
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta

from engine.db import get_client, select_all
from engine.logging import get_logger
from engine.reports.daily import select_and_store_picks

log = get_logger(__name__)

BASKET = "daily_focus"
# 그날 픽을 고를 만큼 리포트가 쌓였는지 — 배치가 정상 완주하면 100건 이상 나온다.
# 1~2건짜리 날은 배치가 뜨다 만 날이라 후보 풀이 없다.
MIN_REPORTS = 30


def _trading_days(start: date, end: date) -> set[date]:
    """ohlcv 에 일봉이 있는 날 = 실제 거래일. 휴장일을 발행 누락으로 오인하지 않기 위해."""
    from engine import db_direct
    import psycopg

    sql = """
      select ts::date d, count(*) n from ohlcv
      where interval='1d' and ts::date between %s and %s
      group by 1 having count(*) > 100
    """
    with psycopg.connect(db_direct._dsn()) as conn, conn.cursor() as cur:
        cur.execute(sql, (start, end))
        return {r[0] for r in cur}


def _report_counts(start: date, end: date) -> dict[date, int]:
    """일자별 발행 indepth 리포트 수 — 백필 가능 여부의 근거."""
    import psycopg
    from engine import db_direct

    sql = """
      select as_of, count(*) from reports
      where report_type='indepth' and status='published' and as_of between %s and %s
      group by 1
    """
    with psycopg.connect(db_direct._dsn()) as conn, conn.cursor() as cur:
        cur.execute(sql, (start, end))
        return {r[0]: r[1] for r in cur}


def _pick_days() -> set[date]:
    rows = select_all("recommendations", "as_of", eq={"basket_type": BASKET})
    return {date.fromisoformat(str(r["as_of"])) for r in rows}


def main() -> None:
    ap = argparse.ArgumentParser(description="daily_focus 픽 과거일 백필")
    ap.add_argument("--from", dest="start", default="2026-06-10")
    ap.add_argument("--to", dest="end", default=None, help="기본: 어제")
    ap.add_argument("--apply", action="store_true", help="실제 적재 (기본은 조사만)")
    args = ap.parse_args()

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=1)

    trading = _trading_days(start, end)
    have = _pick_days()
    reports = _report_counts(start, end)
    missing = sorted(d for d in trading if d not in have)

    doable = [d for d in missing if reports.get(d, 0) >= MIN_REPORTS]
    blocked = [d for d in missing if reports.get(d, 0) < MIN_REPORTS]

    print(f"기간 {start} ~ {end} · 거래일 {len(trading)}일 · 픽 있는 날 "
          f"{len(trading & have)}일 · 누락 {len(missing)}일\n")
    print(f"── 백필 가능 {len(doable)}일 (리포트 {MIN_REPORTS}건 이상) ──")
    for d in doable:
        print(f"  {d}  리포트 {reports.get(d, 0):>4}건")
    print(f"\n── 백필 불가 {len(blocked)}일 (근거 데이터 없음 — 배치 자체가 안 돎) ──")
    for d in blocked:
        print(f"  {d}  리포트 {reports.get(d, 0):>4}건")

    if not args.apply:
        print("\n[조사만] 적재하지 않았다. 실행하려면 --apply")
        return

    print(f"\n── 백필 실행 ({len(doable)}일) ──")
    total = 0
    # 날짜 오름차순 — _open_instrument_ids 가 '그 시점 보유'를 앞 날짜부터 누적해야
    # 맞게 나온다. 역순으로 돌리면 뒤 날짜가 앞 날짜 픽을 못 보고 중복이 생긴다.
    for d in doable:
        n = select_and_store_picks(d.isoformat())
        total += n
        print(f"  {d}  픽 {n}건")
    print(f"\n[완료] {len(doable)}일 · 총 {total}건 적재")
    print("  다음: 상태 판정 → python -c \"from engine.reports.daily import "
          "manage_picks; print(manage_picks())\"")
    print("        중복 재점검 → python -m scripts.cleanup_picks")


if __name__ == "__main__":
    main()
