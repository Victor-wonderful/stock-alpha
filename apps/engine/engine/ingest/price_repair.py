"""과거 주가 재계산 — 주식 병합·감자 뒤 옛 가격이 옛 기준으로 남는 문제.

무슨 일이 일어나는가. 회사가 10주를 1주로 합치면(액면병합·감자) 주가가 10배가 된다.
거래소는 그때 **과거 가격도 전부 10배로 다시 계산**해 내려준다(수정주가). 그래야
"어제 대비 얼마 올랐나"가 말이 되기 때문이다.

그런데 우리 인제스트는 최근 7일치만 받아 덮어쓴다. 그래서 합병일 이후 행만 새 기준
(5,440원)이 되고 그 전 행은 옛 기준(544원)으로 남는다 → 합병일에 **가짜 +900%** 가
생긴다. 실측(2026-08-16): 일봉 160만건 중 187건이 이렇게 오염, 종목 149개.

왜 치명적인가. 이 가짜 점프는 하필 '감자·병합 공시가 난 날'에 정확히 찍힌다. 공시가
주가에 미친 영향을 재려는데 측정 대상 그 날짜가 통째로 거짓이 된다(실측에서 감자 공시
한 달 수익률이 +230% 로 나왔다 — 오른 게 아니라 주식을 합친 것뿐이다).

탐지 원리는 단순하다 — **한국 주식은 하루 ±30% 를 못 넘는다**(2015년부터 가격제한폭).
그걸 넘는 일간 등락은 실제 거래가 아니라 기준 변경이거나 데이터 오류다. 예외는 신규
상장 첫날·정리매매처럼 제한폭이 없는 경우라, 재수집 후에도 남는 건 그런 진짜 사례로
보고 로그만 남긴다(무한 재수집 방지).
"""
from __future__ import annotations

from engine.logging import get_logger

log = get_logger(__name__)

# 가격제한폭 30% + 여유. 종가 반올림·우선주 등으로 30%를 아주 살짝 넘는 경우가 있어
# 곧바로 재수집을 걸지 않는다. 진짜 기준 변경은 몇 배 단위라 이 문턱에 안 걸릴 수 없다.
LIMIT = 0.35

# 한 번에 고칠 종목 수 상한 — 재수집은 종목당 pykrx 왕복 1회다. 이상 종목이 갑자기
# 수백 개로 잡히는 날(업스트림 사고)에 배치가 몇 시간씩 붙잡히지 않게 한다.
MAX_REPAIR = 200

# 재수집 기간 — 과거 전체를 새 기준으로 다시 받아야 연속된다. 부분만 받으면
# 경계가 옮겨갈 뿐 문제가 그대로다.
REFETCH_DAYS = 1200


def impossible_moves(rows: list[tuple], limit: float = LIMIT) -> dict[int, list[dict]]:
    """(instrument_id, 날짜, 일간등락) 목록 → 종목별 불가능한 등락. (순수 함수)

    rows 는 (iid, date, ret) 튜플. 가격제한폭을 넘는 값만 모은다.
    """
    out: dict[int, list[dict]] = {}
    for iid, d, r in rows:
        if r is None:
            continue
        if abs(float(r)) > limit:
            out.setdefault(int(iid), []).append(
                {"date": str(d)[:10], "ret": float(r)}
            )
    return out


def detect(limit: float = LIMIT) -> dict[int, list[dict]]:
    """DB 전체를 훑어 불가능한 등락을 찾는다. 단일 쿼리(db_direct)."""
    import psycopg

    from engine.db_direct import _dsn

    sql = """
        with d as (
          select instrument_id, (ts at time zone 'UTC')::date dt, close,
                 lag(close) over (partition by instrument_id order by ts) prev
          from ohlcv where interval = '1d'
        )
        select instrument_id, dt, close / prev - 1
        from d where prev > 0 and abs(close / prev - 1) > %s
    """
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (limit,))
            rows = cur.fetchall()
    found = impossible_moves(rows, limit)
    log.info("price_repair.detect", instruments=len(found),
             bars=sum(len(v) for v in found.values()))
    return found


def refetch(instrument_id: int, symbol: str, days: int = REFETCH_DAYS) -> int:
    """한 종목의 과거 일봉을 새 기준으로 다시 받아 덮어쓴다. 적재 건수 반환."""
    from datetime import timedelta

    from engine.db import upsert
    from engine.ingest import krx
    from engine.timeutil import kst_today

    today = kst_today()
    start = today - timedelta(days=days)
    df = krx.fetch_ohlcv(symbol, start.strftime("%Y%m%d"), today.strftime("%Y%m%d"))
    rows = krx.normalize_ohlcv(df, instrument_id)
    if not rows:
        log.warning("price_repair.refetch.empty", symbol=symbol)
        return 0
    return upsert("ohlcv", rows, on_conflict="instrument_id,ts,interval")


def run(limit: float = LIMIT, max_repair: int = MAX_REPAIR) -> dict:
    """탐지 → 재수집 → 재탐지. 남은 건 제한폭이 없는 진짜 사례로 보고 로그만.

    반환: {detected, repaired, rows, remaining}
    """
    from engine.db import select_all

    found = detect(limit)
    if not found:
        return {"detected": 0, "repaired": 0, "rows": 0, "remaining": 0}

    sym_by_id = {
        int(r["id"]): r["symbol"]
        for r in select_all("instruments", "id,symbol")
        if r.get("symbol")
    }
    # 오염이 심한 종목부터 — 상한에 걸려 다 못 고칠 때 나쁜 것부터 고친다.
    targets = sorted(
        found, key=lambda i: max(abs(x["ret"]) for x in found[i]), reverse=True
    )
    if len(targets) > max_repair:
        log.warning("price_repair.capped", found=len(targets), cap=max_repair)
        targets = targets[:max_repair]

    rows = 0
    repaired = 0
    for iid in targets:
        sym = sym_by_id.get(iid)
        if not sym:
            continue
        try:
            n = refetch(iid, sym)
        except Exception as e:                      # 종목 하나가 배치를 죽이지 않게
            log.warning("price_repair.refetch.failed", symbol=sym, err=str(e))
            continue
        rows += n
        repaired += 1

    left = detect(limit)
    if left:
        # 신규상장 첫날·정리매매는 제한폭이 없어 재수집해도 남는다 — 진짜 값이다.
        log.info("price_repair.remaining", instruments=len(left),
                 sample=[sym_by_id.get(i) for i in list(left)[:5]])
    out = {"detected": len(found), "repaired": repaired, "rows": rows,
           "remaining": len(left)}
    log.info("price_repair.done", **out)
    return out
