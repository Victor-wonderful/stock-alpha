"""리스크 지표 실행 — 활성종목 종가 벌크 로드 → metrics → risk_metrics 적재.

시장수익률은 유니버스 동일가중 프록시(별도 지수 인제스트 불필요). date×instrument
종가 행렬을 한 번 만들어 벡터화 계산.
"""
from __future__ import annotations

import pandas as pd

from engine.db import select_all, upsert
from engine.logging import get_logger
from engine.risk import metrics as M

log = get_logger(__name__)

SOURCE_VERSION = "risk-v1"


def _load_close_matrix(active_ids: set[int], bars: int = 150) -> pd.DataFrame:
    """최근 `bars` 거래일 종가 → date×instrument 행렬(활성종목만).

    직접 PG(서버사이드 커서 스트리밍)만 쓴다. 원래는 PostgREST 로 range 페이지네이션
    을 돌았는데, ohlcv 가 커지면서 정렬+오프셋 쿼리가 statement timeout(57014) 으로
    죽는다 — 2026-07-30 코드 복원 시 첫 실행이 실제로 이걸로 실패했다.

    종가만 필요하지만 close 전용 경량 로더(load_all_close_1d)는 날짜를 주지 않는다.
    베타는 시장수익률과 날짜를 맞춰야 하고 종목마다 상장·거래정지로 길이가 다르므로,
    위치 정렬은 틀어진다. ts 를 함께 주는 load_all_ohlcv_1d 를 써야 정확하다.
    """
    from engine import db_direct

    if not db_direct.available():
        log.error(
            "risk.load.no_db_direct",
            note="PostgREST 폴백은 대용량에서 timeout — DATABASE_URL 확인 필요",
        )
        return pd.DataFrame()

    frames = db_direct.load_all_ohlcv_1d(bars=bars)
    parts = [
        pd.DataFrame({
            "d": pd.to_datetime(df["ts"]).dt.date,
            "instrument_id": iid,
            "close": df["close"].astype(float),
        })
        for iid, df in frames.items()
        if iid in active_ids and not df.empty
    ]
    if not parts:
        return pd.DataFrame()
    # 같은 (date,instrument) 중복 시 마지막 값
    return pd.concat(parts, ignore_index=True).pivot_table(
        index="d", columns="instrument_id", values="close", aggfunc="last"
    )


def run(bars: int = 150) -> int:
    """전 활성종목 리스크 지표 산출·적재. 최신 거래일 1건/종목.

    bars 는 캘린더 일수가 아니라 거래일 수. 150 ≈ 7개월치로, 베타·연율변동성·
    VaR·MDD 를 함께 추정하기에 필요한 최소선으로 잡았다.
    """
    active = select_all("instruments", "id", eq={"active": True})
    active_ids = {r["id"] for r in active}
    matrix = _load_close_matrix(active_ids, bars=bars)
    if matrix.empty:
        log.warning("risk.run.no_data")
        return 0

    mkt = M.market_returns(matrix)
    as_of = max(matrix.index).isoformat()

    out: list[dict] = []
    for iid in matrix.columns:
        close = matrix[iid].dropna()
        if len(close) < 20:
            continue
        m = M.compute_metrics(close, mkt)
        if all(v is None for v in m.values()):
            continue
        out.append({
            "instrument_id": int(iid),
            "date": as_of,
            **m,
            "source_version": SOURCE_VERSION,
        })

    n = upsert("risk_metrics", out, on_conflict="instrument_id,date")
    log.info("risk.run.done", rows=n, instruments=len(matrix.columns), as_of=as_of)
    return n
