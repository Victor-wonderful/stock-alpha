"""진단 2 — 플레이북 성과를 스타일 × 유동성 구간으로 분해.

가설: (1) 비유동 종목이 성과를 오염 (2) 일봉 위 스캘핑/데이 스타일이 무의미
(3) ATR 배수 미캘리브레이션. 어디서 손실이 나는지 위치를 특정한다.
"""
from __future__ import annotations

import random
from collections import defaultdict

import pandas as pd

from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GateThresholds, evaluate_gate
from engine.db import get_client, select_all
from engine.signals import playbooks
from engine.signals.levels import compute_levels  # noqa: F401 (참조 확인용)

SAMPLE = 400
LIQ_FLOOR = 100_000_000  # 리포트 게이트와 동일(20일 평균 거래대금 1억)


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


def _bucket(df: pd.DataFrame) -> str:
    t = float((df["close"] * df["volume"]).tail(20).mean())
    if t >= 1_000_000_000:
        return "liquid_10억+"
    if t >= LIQ_FLOOR:
        return "mid_1~10억"
    return "illiquid_<1억"


# 스타일을 알기 위해 Trade 에 스타일이 없으므로 detector 가 주는 cand.style 별로
# 따로 돌린다 — backtest_playbook 은 setup 단위라 스타일 혼합. 간단히: setup 별 ×
# 유동성 버킷 분해 + (별도) cand.style 분포만 출력.

def main() -> None:
    inst = select_all("instruments", "id", eq={"active": True})
    random.seed(7)
    ids = random.sample([it["id"] for it in inst], SAMPLE)
    frames = {i: _load(i) for i in ids}
    frames = {k: v for k, v in frames.items() if len(v) >= 120}
    print(f"loaded {len(frames)} instruments")

    by_key: dict[tuple[str, str], list] = defaultdict(list)
    style_count: dict[tuple[str, str], int] = defaultdict(int)
    for iid, df in frames.items():
        b = _bucket(df)
        for setup in playbooks.ALL_DETECTORS:
            trades = backtest_playbook(df, setup)
            by_key[(setup, b)].extend(trades)
            # 스타일 분포(트리거 시점 스타일) — detector 1회 호출로 추정
            cand = playbooks.ALL_DETECTORS[setup](df)
            if cand is not None:
                style_count[(setup, cand.style)] += 1

    thr = GateThresholds(min_trades=10)
    print(f"\n{'setup':<16} {'bucket':<14} {'n':>5} {'WR':>6} {'expR':>8} {'R-MDD':>7}")
    for (setup, b), trades in sorted(by_key.items()):
        gr = evaluate_gate(trades, thr)
        print(f"{setup:<16} {b:<14} {gr.n_trades:>5} "
              f"{(gr.win_rate or 0):>6.2f} {(gr.expectancy_r if gr.expectancy_r is not None else float('nan')):>8.3f} "
              f"{(gr.mdd if gr.mdd is not None else float('nan')):>7.3f}")

    print("\nstyle distribution at last bar:")
    for (setup, style), n in sorted(style_count.items()):
        print(f"  {setup:<16} {style:<10} {n}")


if __name__ == "__main__":
    main()
