"""진단: 단일팩터 IC 감사 (가격 팩터). 어떤 팩터가 실제로 미래수익을 예측하는지.

현재 factor_composite 는 6팩터 고정가중 합성인데 횡단면 게이트 FAIL(IC +0.043·t≈0).
원인 후보: ① 죽은 팩터가 합성을 희석 ② 가중치가 데이터 미검증 추정값.
이 스크립트는 **각 가격 팩터를 개별로** IC·상위10% 초과수익 t 로 평가해 어느 팩터가
살아있는지 가린다. 재무 팩터(value/quality/growth) point-in-time IC 는 다음 단계.

실행(로컬 권장): python -m scripts.diag_factor_ic
"""
from __future__ import annotations

import math

import pandas as pd

from engine.backtest.cross_section import (
    FWD_BARS,
    MOM_LOOKBACK,
    MOM_SKIP,
    REBALANCE_BARS,
    TOP_QUANTILE,
    VOL_WINDOW,
    _load_close_series,
    _zscore,
)
from engine.backtest.metrics import information_coefficient
from engine.db import select_all


def _factor_series(closes: pd.DataFrame, i: int) -> dict[str, pd.Series]:
    """i시점 개별 가격 팩터 점수(z) — point-in-time."""
    past = closes.iloc[i - MOM_SKIP]
    base = closes.iloc[i - MOM_SKIP - MOM_LOOKBACK]
    momentum = past / base - 1
    window = closes.iloc[i - VOL_WINDOW : i + 1]
    lowvol = -window.pct_change().std()
    # 단기 반전(1개월 수익률의 음) — 보조 비교용
    st_rev = -(closes.iloc[i] / closes.iloc[i - MOM_SKIP] - 1)
    return {
        "momentum_12_1": _zscore(momentum.dropna()).reindex(closes.columns),
        "lowvol": _zscore(lowvol.dropna()).reindex(closes.columns),
        "short_rev": _zscore(st_rev.dropna()).reindex(closes.columns),
    }


def main() -> None:
    inst = select_all("instruments", "id", eq={"active": True})
    series = []
    for it in inst:
        s = _load_close_series(it["id"])
        if s is not None:
            series.append(s)
    closes = pd.concat(series, axis=1).sort_index()
    print(f"universe={closes.shape[1]} bars={closes.shape[0]}\n")

    start = MOM_SKIP + MOM_LOOKBACK + VOL_WINDOW
    factors = ["momentum_12_1", "lowvol", "short_rev"]
    ics: dict[str, list[float]] = {f: [] for f in factors}
    exc: dict[str, list[float]] = {f: [] for f in factors}

    for i in range(start, len(closes) - FWD_BARS, REBALANCE_BARS):
        fser = _factor_series(closes, i)
        fwd = closes.iloc[i + FWD_BARS] / closes.iloc[i] - 1
        for f in factors:
            df = pd.DataFrame({"score": fser[f], "fwd": fwd}).dropna()
            if len(df) < 100:
                continue
            ic = information_coefficient(df["score"].tolist(), df["fwd"].tolist())
            if ic is None:
                continue
            ics[f].append(ic)
            top = df[df["score"] >= df["score"].quantile(TOP_QUANTILE)]
            exc[f].append(float(top["fwd"].mean() - df["fwd"].mean()))

    print(f"{'factor':16} {'n':>4} {'meanIC':>8} {'IC>0%':>7} {'exMean':>8} {'exT':>7}")
    print("-" * 56)
    for f in factors:
        xs, es = ics[f], exc[f]
        n = len(xs)
        if not n:
            print(f"{f:16} {0:>4}  (표본 없음)")
            continue
        mic = sum(xs) / n
        pos = sum(1 for x in xs if x > 0) / n
        em = sum(es) / n
        if n >= 2:
            var = sum((x - em) ** 2 for x in es) / (n - 1)
            sd = math.sqrt(var)
            t = em / (sd / math.sqrt(n)) if sd > 0 else 0.0
        else:
            t = 0.0
        print(f"{f:16} {n:>4} {mic:>8.4f} {pos:>7.0%} {em:>8.4f} {t:>7.2f}")


if __name__ == "__main__":
    main()
