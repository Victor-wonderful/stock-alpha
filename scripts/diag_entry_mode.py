"""진입 체결 가정 3종 비교 (2026-08-20).

배경: 라이브 픽 48건에서 손절 픽은 24/24 체결됐는데 목표 픽은 1/3 만 체결됐다.
지정가 진입이 «좋은 픽만 골라 걸러내는» 필터로 작동했고, 승률 11% → 0% 로 정정됐다.
그런데 게이트는 여전히 「무조건 체결」 가정 위에서 조합을 통과시키고 있다.

이 스크립트는 같은 데이터·같은 셋업에 진입 가정만 바꿔 돌린다:

  signal — 신호 봉 가격에 무조건 체결 (지금 게이트가 쓰는 가정)
  limit  — 다음 봉부터 저가 ≤ 진입가 인 봉에서 체결 (지금 라이브가 하는 것)
  open   — 다음 봉 시가에 시장가 진입, 레벨은 그 시가 기준 재계산

읽는 법: signal 과 limit 의 차이가 «게이트가 과대평가한 정도»다.
open 이 limit 보다 나으면 발행 방식을 시가 진입으로 바꿀 근거가 된다.

DB 에 아무것도 쓰지 않는다 — 진단 전용.

사용:
    python scripts/diag_entry_mode.py              # 게이트 통과 조합만(빠름)
    python scripts/diag_entry_mode.py --all        # 전 조합
"""
from __future__ import annotations

import argparse
import sys

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GateThresholds, evaluate_gate
from engine.backtest.metrics import Trade
from engine.liquidity import filter_liquid_frames
from engine.logging import get_logger
from engine.signals import playbooks

log = get_logger(__name__)

MODES = ("signal", "limit", "open")

# 지금 게이트를 통과 중인 조합 — 여기가 흔들리면 발행이 흔들린다.
FOCUS = [
    ("ensemble", "position"), ("pivot", "swing"), ("oversold_bounce", "swing"),
    ("capitulation", "swing"), ("breakout", "swing"), ("breakout", "position"),
    ("vol_squeeze", "position"), ("flow_accumulation", "swing"),
    ("flow_accumulation", "position"), ("double_bottom", "swing"),
    ("double_bottom", "position"), ("anchor_pullback", "swing"),
    ("anchor_pullback", "position"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="전 조합(느림)")
    args = ap.parse_args()

    from engine.backtest.runner import _load_active_frames
    from engine.signals.runner import (
        load_disclosures_map, load_earnings_map, load_flows_map,
    )

    frames = filter_liquid_frames(_load_active_frames(bars=500))
    print(f"유니버스 {len(frames)}종목")
    flows_map, earnings_map, discl_map = (
        load_flows_map(), load_earnings_map(), load_disclosures_map()
    )
    costs = default_cost_model()
    thr = GateThresholds()

    combos = (
        [(s, st) for s in playbooks.ALL_DETECTORS for st in playbooks.testable_styles(s)]
        if args.all else FOCUS
    )
    print(f"조합 {len(combos)}개 × 모드 {len(MODES)}\n")

    hdr = f"{'셋업':<18}{'스타일':<10}{'모드':<8}{'거래수':>8}{'승률':>8}{'손익비':>8}{'기대값R':>9}  게이트"
    print(hdr)
    print("-" * len(hdr))

    for setup, style in combos:
        row_by_mode = {}
        for mode in MODES:
            trades: list[Trade] = []
            for iid, df in frames.items():
                trades.extend(backtest_playbook(
                    df, setup,
                    flows=flows_map.get(iid), earnings=earnings_map.get(iid),
                    disclosures=discl_map.get(iid), costs=costs,
                    style_override=style, scaleout=True, entry_mode=mode,
                ))
            trades.sort(key=lambda t: t.entry_ts)
            gr = evaluate_gate(trades, thr)
            row_by_mode[mode] = (len(trades), gr)
            wr = f"{gr.win_rate*100:.1f}%" if gr.win_rate is not None else "—"
            rr = f"{gr.avg_rr:.2f}" if gr.avg_rr is not None else "—"
            ex = f"{gr.expectancy_r:+.3f}" if gr.expectancy_r is not None else "—"
            mark = "통과" if gr.passed else ""
            print(f"{setup:<18}{style:<10}{mode:<8}{len(trades):>8,}{wr:>8}{rr:>8}{ex:>9}  {mark}")
        # 요약 — 무조건체결 대비 지정가가 얼마나 깎이나
        sg = row_by_mode["signal"][1].expectancy_r
        lm = row_by_mode["limit"][1].expectancy_r
        op = row_by_mode["open"][1].expectancy_r
        if sg is not None and lm is not None:
            drop = lm - sg
            best = max(((lm, "limit"), (op or -99, "open")))
            print(f"{'':<18}{'':<10}→ 지정가 반영 시 기대값 {drop:+.3f}R "
                  f"· 더 나은 쪽: {best[1]}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
