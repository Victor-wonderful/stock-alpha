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


def _load_fy_fundamentals() -> dict[int, list[tuple]]:
    """종목별 FY 재무 as-of 룩업 — [(known_from, ni, eq, sh)] 오름차순.

    2024FY 는 disclosed_at NULL 이나 표본 시작 전(2024-03) 공시 확정 → known_from
    을 아주 이른 날짜로 둬 '표본 내내 알려진 값'으로 취급. 2025FY 는 실제 disclosed_at.
    """
    rows = select_all(
        "financials",
        "instrument_id,period,net_income,equity,shares,disclosed_at",
    )
    by: dict[int, list[tuple]] = {}
    for r in rows:
        if not str(r.get("period", "")).endswith("FY"):
            continue
        period = r["period"]
        known = r.get("disclosed_at")
        if not known:
            known = "2000-01-01" if period <= "2024FY" else "2099-01-01"
        ni, eq, sh = r.get("net_income"), r.get("equity"), r.get("shares")
        by.setdefault(int(r["instrument_id"]), []).append(
            (str(known)[:10], period, ni, eq, sh)
        )
    for iid in by:
        by[iid].sort(key=lambda t: (t[0], t[1]))
    return by


def _asof_fundamentals(fund: list[tuple], date: str) -> tuple:
    """date 시점에 알려진 최신 FY + 직전 FY(성장률용). 없으면 모두 None."""
    known = [t for t in fund if t[0] <= date]
    if not known:
        return (None, None, None, None)
    latest = known[-1]
    prior_ni = known[-2][2] if len(known) >= 2 else None
    return (latest[2], latest[3], latest[4], prior_ni)  # ni, eq, sh, prior_ni


def _fundamental_series(closes: pd.DataFrame, i: int, fund: dict) -> dict[str, pd.Series]:
    """i시점 재무 팩터(value/quality/growth) z — point-in-time(as-of disclosed)."""
    date = str(closes.index[i])[:10]
    price = closes.iloc[i]
    ey: dict[int, float] = {}
    by_: dict[int, float] = {}
    qual: dict[int, float] = {}
    grow: dict[int, float] = {}
    for iid in closes.columns:
        f = fund.get(iid)
        if not f:
            continue
        ni, eq, sh, prior = _asof_fundamentals(f, date)
        p = price.get(iid)
        if p is None or pd.isna(p):
            continue
        mcap = p * sh if sh else None
        if mcap and mcap > 0:
            if ni is not None:
                ey[iid] = ni / mcap
            if eq is not None:
                by_[iid] = eq / mcap
        if eq and ni is not None and eq != 0:
            qual[iid] = ni / eq
        if prior and ni is not None and prior != 0:
            grow[iid] = ni / prior - 1
    value = pd.concat([pd.Series(ey), pd.Series(by_)], axis=1).mean(axis=1)
    return {
        "value": _zscore(value.dropna()).reindex(closes.columns),
        "quality": _zscore(pd.Series(qual).dropna()).reindex(closes.columns),
        "growth": _zscore(pd.Series(grow).dropna()).reindex(closes.columns),
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
    fund = _load_fy_fundamentals()

    start = MOM_SKIP + MOM_LOOKBACK + VOL_WINDOW
    factors = ["momentum_12_1", "lowvol", "short_rev", "value", "quality", "growth"]
    # 후보 합성 가중 — 데이터로 비교. =현행/ VQ=가치+퀄 / VQM=+모멘텀.
    combos: dict[str, dict[str, float]] = {
        "=current": {"value": .25, "quality": .20, "momentum_12_1": .20,
                     "growth": .15, "lowvol": .10},
        "=VQ": {"value": .5, "quality": .5},
        "=VQM": {"value": .4, "quality": .4, "momentum_12_1": .2},
    }
    keys = factors + list(combos)
    ics: dict[str, list[float]] = {k: [] for k in keys}
    exc: dict[str, list[float]] = {k: [] for k in keys}

    def _record(name: str, score: pd.Series, fwd: pd.Series) -> None:
        df = pd.DataFrame({"score": score, "fwd": fwd}).dropna()
        if len(df) < 100:
            return
        ic = information_coefficient(df["score"].tolist(), df["fwd"].tolist())
        if ic is None:
            return
        ics[name].append(ic)
        top = df[df["score"] >= df["score"].quantile(TOP_QUANTILE)]
        exc[name].append(float(top["fwd"].mean() - df["fwd"].mean()))

    for i in range(start, len(closes) - FWD_BARS, REBALANCE_BARS):
        fser = _factor_series(closes, i)
        fser.update(_fundamental_series(closes, i, fund))
        fwd = closes.iloc[i + FWD_BARS] / closes.iloc[i] - 1
        for f in factors:
            _record(f, fser[f], fwd)
        for name, w in combos.items():
            score = sum((fser[f].fillna(0) * wt for f, wt in w.items()),
                        start=pd.Series(0.0, index=closes.columns))
            _record(name, score, fwd)

    print(f"{'factor':16} {'n':>4} {'meanIC':>8} {'IC>0%':>7} {'exMean':>8} {'exT':>7}")
    print("-" * 56)
    for f in keys:
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
