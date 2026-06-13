"""진단: 거래비용 반영 후, 각 셋업을 native 스타일 vs position 스타일(넓은 손절)로
백테스트해 순기대값(net R)을 비교한다. #2(장기호흡 재설계)의 근거 데이터.

position 스타일은 손절 3.0×ATR(swing 1.8×) + 타임아웃 60봉(swing 10) → 비용 R-잠식이
대략 절반. 손절을 넓히면 gross R 도 함께 줄지만(같은 가격이동의 R 가 작아짐),
비용 비중이 더 크게 줄면 net 이 개선될 수 있다. 어느 셋업이 그런지 확인.

실행: python -m scripts.diag_cost_styles
"""
from __future__ import annotations

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GateThresholds, evaluate_gate
from engine.backtest.runner import _load_ohlcv
from engine.db import select_all
from engine.liquidity import filter_liquid_frames
from engine.signals import playbooks
from engine.signals.runner import load_earnings_map, load_flows_map


def main() -> None:
    inst = select_all("instruments", "id", eq={"active": True})
    frames = {it["id"]: _load_ohlcv(it["id"]) for it in inst}
    frames = {k: v for k, v in frames.items() if not v.empty}
    frames = filter_liquid_frames(frames)
    flows_map = load_flows_map()
    earnings_map = load_earnings_map()
    costs = default_cost_model()
    thr = GateThresholds()
    print(f"liquid universe: {len(frames)}  costs: comm={costs.commission_pct} "
          f"tax={costs.tax_pct} slip={costs.slippage_pct}\n")
    print(f"{'setup':18} {'style':9} {'n':>5} {'gross':>8} {'net':>8} {'mdd':>6} {'pass'}")
    print("-" * 64)

    for setup in playbooks.ALL_DETECTORS:
        for variant in ("native", "position"):
            override = None if variant == "native" else "position"
            trades = []
            for iid, df in frames.items():
                trades.extend(backtest_playbook(
                    df, setup, flows=flows_map.get(iid),
                    earnings=earnings_map.get(iid), costs=costs,
                    style_override=override,
                ))
            trades.sort(key=lambda t: t.entry_ts)
            gr = evaluate_gate(trades, thr)
            gross = (sum(t.r_gross for t in trades) / len(trades)) if trades else 0.0
            label = playbooks.ALL_DETECTORS  # noop
            style_lbl = variant if variant == "position" else "(native)"
            net = gr.expectancy_r if gr.expectancy_r is not None else 0.0
            mdd = gr.mdd if gr.mdd is not None else 0.0
            print(f"{setup:18} {style_lbl:9} {gr.n_trades:>5} {gross:>8.4f} "
                  f"{net:>8.4f} {mdd:>6.3f} {'PASS' if gr.passed else 'fail'}")
        print()


if __name__ == "__main__":
    main()
