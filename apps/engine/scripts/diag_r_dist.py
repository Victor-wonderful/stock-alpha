"""진단 — 플레이북 트레이드 R 분포·리스크 크기 점검 (게이트 캘리브레이션용)."""
from __future__ import annotations

import random

import pandas as pd

from engine.backtest.event_backtest import backtest_playbook
from engine.db import get_client, select_all


def _load(iid: int, limit: int = 500) -> pd.DataFrame:
    res = (
        get_client().table("ohlcv").select("ts,open,high,low,close,volume")
        .eq("instrument_id", iid).eq("interval", "1d")
        .order("ts", desc=True).limit(limit).execute()
    )
    rows = list(reversed(res.data or []))
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)[["open", "high", "low", "close", "volume"]].astype(float)


def main() -> None:
    inst = select_all("instruments", "id", eq={"active": True})
    random.seed(42)
    sample = random.sample([it["id"] for it in inst], 300)
    rs: list[float] = []
    for iid in sample:
        df = _load(iid)
        if df.empty:
            continue
        rs.extend(t.r_multiple for t in backtest_playbook(df, "leader_trend"))
    s = pd.Series(rs)
    print(f"n={len(s)}")
    print(s.describe(percentiles=[0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99]))
    print("\n|R|>10:", int((s.abs() > 10).sum()), " |R|>5:", int((s.abs() > 5).sum()))
    print("mean(all):", round(s.mean(), 4),
          " mean(clip±10R):", round(s.clip(-10, 10).mean(), 4))


if __name__ == "__main__":
    main()
