"""진단: 분할익절(스케일아웃) 청산이 단일 tp1 전량청산 대비 우위인지 검증.

처방2-2 — "근접 1차 목표/부분 익절"을 레벨 이동이 아니라 *청산 규칙*으로 실험.
검증된 진입/손절(compute_levels)은 그대로 두고, 청산만 두 방식으로 시뮬레이션:

  baseline : 손절 / tp1 / 타임아웃 — 전량 (event_backtest 와 동일)
  scaleout : tp1 에서 50% 익절 + 나머지 본전(entry)으로 스톱 상향 후 tp2 까지 런
             (못 가면 본전/타임아웃) — 블렌디드 R

출시 조건: scaleout 의 net expectancy_r ≥ baseline AND win_rate 유의 상승.
둘 다 아니면 발행 안 함(검증 전 레벨/청산 변경 금지 원칙).

실행: (apps/engine, 워크트리 코드+자격증명)
  PYTHONPATH=<wt>/apps/engine python -m scripts.diag_scaleout [max_instruments]
"""
from __future__ import annotations

import sys

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import _TIMEOUT_BARS
from engine.backtest.gate import GateThresholds, evaluate_gate
from engine.backtest.metrics import Trade
from engine.backtest.runner import _load_ohlcv
from engine.db import select_all
from engine.liquidity import filter_liquid_frames
from engine.signals import playbooks
from engine.signals.levels import compute_levels, min_risk_floor
from engine.signals.runner import load_earnings_map, load_flows_map

W1 = 0.5  # tp1 익절 비중
W2 = 0.5  # 런 비중


def _sim_trade(df, i, n, entry, stop, tp1, tp2, timeout, costs, risk, entry_ts):
    """한 트레이드를 baseline·scaleout 두 방식으로 청산 → (Trade_base, Trade_scale)."""
    # ── baseline: 손절/tp1/타임아웃 전량 ──
    b_exit, b_idx = None, min(i + timeout, n - 1)
    for j in range(i + 1, b_idx + 1):
        lo, hi = float(df["low"].iloc[j]), float(df["high"].iloc[j])
        if lo <= stop:
            b_exit, b_idx = stop, j
            break
        if hi >= tp1:
            b_exit, b_idx = tp1, j
            break
    if b_exit is None:
        b_exit = float(df["close"].iloc[b_idx])
    b_pnl = costs.net_pnl(entry, b_exit)

    # ── scaleout: tp1 50% + 본전스톱 후 tp2 런 ──
    cap = min(i + timeout, n - 1)
    t1_exit = t2_exit = None
    t1_done = False
    s_idx = cap
    for j in range(i + 1, cap + 1):
        lo, hi = float(df["low"].iloc[j]), float(df["high"].iloc[j])
        if not t1_done:
            if lo <= stop:                 # tp1 전 손절 → 전량 손절
                t1_exit = t2_exit = stop
                s_idx = j
                break
            if hi >= tp1:                  # 1차 익절, 나머지 본전스톱
                t1_exit = tp1
                t1_done = True
                continue                   # 같은 봉서 tp2 불허(보수적)
        else:
            if lo <= entry:                # 본전 청산(보수적: 먼저 검사)
                t2_exit = entry
                s_idx = j
                break
            if hi >= tp2:                  # 2차 목표
                t2_exit = tp2
                s_idx = j
                break
    if t1_exit is None:                    # tp1 미도달 → 타임아웃 전량 종가
        t1_exit = t2_exit = float(df["close"].iloc[cap])
        s_idx = cap
    elif t2_exit is None:                  # tp1 후 타임아웃 → 잔량 종가
        t2_exit = float(df["close"].iloc[cap])
        s_idx = cap
    s_pnl = W1 * costs.net_pnl(entry, t1_exit) + W2 * costs.net_pnl(entry, t2_exit)

    return (
        Trade(r_multiple=b_pnl / risk, ret_pct=b_pnl / entry,
              bars_held=b_idx - i, entry_ts=entry_ts),
        Trade(r_multiple=s_pnl / risk, ret_pct=s_pnl / entry,
              bars_held=s_idx - i, entry_ts=entry_ts),
    )


def _trades_for(df, setup, style, flows, earnings, costs):
    detector = playbooks.ALL_DETECTORS.get(setup)
    if detector is None or len(df) < 62:
        return [], []
    needs_flows = setup == "flow_accumulation"
    needs_earn = setup == "pead"
    if needs_flows and (flows is None or flows.empty):
        return [], []
    if needs_earn and (earnings is None or earnings.empty):
        return [], []
    base, scale = [], []
    i, n = 60, len(df)
    while i < n - 1:
        window = df.iloc[: i + 1]
        if needs_flows:
            fwin = (flows[flows["date"] <= str(df["ts"].iloc[i])[:10]]
                    if "ts" in df.columns else flows)
            cand = detector(window, flows=fwin)
        elif needs_earn:
            cand = detector(window, earnings=earnings)
        else:
            cand = detector(window)
        if cand is None or cand.side != "buy":
            i += 1
            continue
        lv = compute_levels(style=style, side="buy", entry_price=cand.entry_ref,
                            atr=cand.atr, risk_per_trade_pct=1.0,
                            support=cand.support, resistance=cand.resistance)
        entry, stop, risk = lv.entry_price, lv.stop_loss, lv.entry_price - lv.stop_loss
        if risk <= 0 or risk < min_risk_floor(entry, cand.atr):
            i += 1
            continue
        ts = str(df["ts"].iloc[i]) if "ts" in df.columns else ""
        tb, tscale = _sim_trade(df, i, n, entry, stop, lv.tp1, lv.tp2,
                                _TIMEOUT_BARS.get(style, 60), costs, risk, ts)
        base.append(tb)
        scale.append(tscale)
        # 청산 다음 봉부터 재탐색(중첩 방지) — baseline exit 인덱스 기준.
        i = i + tb.bars_held + 1
    return base, scale


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    inst = select_all("instruments", "id", eq={"active": True})
    if limit:
        inst = inst[:limit]
    frames = {it["id"]: _load_ohlcv(it["id"]) for it in inst}
    frames = filter_liquid_frames({k: v for k, v in frames.items() if not v.empty})
    flows_map, earnings_map = load_flows_map(), load_earnings_map()
    costs = default_cost_model()
    thr = GateThresholds()

    setups = [s for s in playbooks.ALL_DETECTORS
              if "position" in playbooks.ALLOWED_STYLES.get(s, ())]
    print(f"liquid universe: {len(frames)}  setups(position): {setups}\n")
    print(f"{'setup':18} {'exit':9} {'n':>5} {'exp_R':>8} {'win%':>6} "
          f"{'avg_rr':>7} {'mdd':>6} {'pass'}")
    print("-" * 70)

    for setup in setups:
        allb, alls = [], []
        for iid, df in frames.items():
            b, s = _trades_for(df, setup, "position",
                               flows_map.get(iid), earnings_map.get(iid), costs)
            allb.extend(b)
            alls.extend(s)
        allb.sort(key=lambda t: t.entry_ts)
        alls.sort(key=lambda t: t.entry_ts)
        for label, trades in (("baseline", allb), ("scaleout", alls)):
            gr = evaluate_gate(trades, thr)
            print(f"{setup:18} {label:9} {gr.n_trades:>5} "
                  f"{(gr.expectancy_r or 0):>8.4f} "
                  f"{((gr.win_rate or 0)*100):>5.1f}% {(gr.avg_rr or 0):>7.3f} "
                  f"{(gr.mdd or 0):>6.3f} {'PASS' if gr.passed else 'fail'}")
        print()


if __name__ == "__main__":
    main()
