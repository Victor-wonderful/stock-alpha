"""실험: 목표를 ATR 배수 대신 R(실제 손절 거리) 배수로 묶으면 나아지는가.

가설의 근거(2026-08-16, 발행 픽 94건 실측) —
  포지션 설계는 손절 3.0×ATR · 목표 3.0×ATR = 손익비 1.0 인데, 손절이
  _clamp_stop_to_structure 로 지지선까지 당겨져 **실제 중앙값 0.99×ATR** 이 됐다.
  목표는 3.0×ATR 에 묶여 그대로라 손익비가 3.0 으로 부풀었다. 손익비 3.0 은
  방향성 없는 시장에서도 75%가 손절로 끝난다는 뜻이다. 즉 "손절이 자주 걸린다"가
  아니라 "목표가 손절에 비해 너무 멀다"가 정확한 진술이다.

  손절은 구조(지지선)를, 목표는 변동성(ATR)을 따른다 — **서로 다른 자**를 쓴다.
  tp_r_mults 를 주면 목표가 실제 손절 거리에 묶여 둘이 같은 자를 쓴다.

이 스크립트는 backtests 테이블에 **쓰지 않는다** — 운영 게이트를 건드리지 않고
비교만 한다. 채택 결정이 나면 styles.py/levels.py 를 고치고 정식 백테스트를 돌린다.

실행 (apps/engine 에서, 수십 분 소요):
    python -m scripts.exp_target_r_mults
    python -m scripts.exp_target_r_mults --variants 2.0,2.5   # 후보 좁히기
"""
from __future__ import annotations

import argparse
from collections import defaultdict

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GateThresholds, evaluate_gate
from engine.backtest.runner import _load_active_frames
from engine.liquidity import filter_liquid_frames
from engine.logging import get_logger
from engine.signals import playbooks

log = get_logger(__name__)

# tp1/tp2/tp3 를 R 배수로. tp2·tp3 는 tp1 기준 비례 확장(스케일아웃 런 목표).
def _r_set(tp1: float) -> tuple[float, ...]:
    return (tp1, tp1 * 2.0, tp1 * 3.3)


def summarize(trades) -> dict:
    if not trades:
        return {"n": 0}
    rs = [t.r_multiple for t in trades]
    wins = [r for r in rs if r > 0]
    return {
        "n": len(rs),
        "win": len(wins) / len(rs),
        "exp_r": sum(rs) / len(rs),
        "avg_win": (sum(wins) / len(wins)) if wins else 0.0,
        "avg_loss": (sum(r for r in rs if r <= 0) / max(1, len(rs) - len(wins))),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="목표 R 배수 실험")
    ap.add_argument("--variants", default="1.5,2.0,2.5,3.0",
                    help="시험할 tp1 R 배수 (쉼표 구분). 기준선(현행 ATR)은 항상 포함")
    ap.add_argument("--bars", type=int, default=500)
    args = ap.parse_args()
    variants = [float(x) for x in args.variants.split(",") if x.strip()]

    frames = _load_active_frames(bars=args.bars)
    n_all = len(frames)
    frames = filter_liquid_frames(frames)
    log.info("exp.universe", total=n_all, liquid=len(frames))

    from engine.signals.runner import (
        load_disclosures_map, load_earnings_map, load_flows_map,
    )
    flows_map, earnings_map, discl_map = (
        load_flows_map(), load_earnings_map(), load_disclosures_map(),
    )
    costs = default_cost_model()
    thr = GateThresholds()

    # {(setup,style): {variant_label: [trades]}}
    acc: dict[tuple[str, str], dict[str, list]] = defaultdict(lambda: defaultdict(list))
    labels = ["현행(ATR)"] + [f"{v:.1f}R" for v in variants]

    combos = [(s, st) for s in playbooks.ALL_DETECTORS
              for st in playbooks.testable_styles(s)]
    log.info("exp.start", combos=len(combos), variants=labels)

    for ci, (setup, style) in enumerate(combos, 1):
        for iid, df in frames.items():
            kw = dict(
                setup=setup, style_override=style, costs=costs, scaleout=True,
                flows=flows_map.get(iid), earnings=earnings_map.get(iid),
                disclosures=discl_map.get(iid),
            )
            acc[(setup, style)]["현행(ATR)"] += backtest_playbook(df, **kw)
            for v in variants:
                acc[(setup, style)][f"{v:.1f}R"] += backtest_playbook(
                    df, tp_r_mults=_r_set(v), **kw)
        log.info("exp.combo.done", i=ci, of=len(combos), setup=setup, style=style,
                 base_trades=len(acc[(setup, style)]["현행(ATR)"]))

    # ── 출력 ──
    print("\n" + "=" * 100)
    print("셋업 × 스타일 별 기대값(R) — 목표를 무엇에 묶는가")
    print("=" * 100)
    head = f"{'셋업':<20}{'스타일':<10}" + "".join(f"{lab:>13}" for lab in labels)
    print(head)
    print("-" * len(head))

    better = defaultdict(int)
    pass_count = defaultdict(int)
    for (setup, style), byvar in sorted(acc.items()):
        base = summarize(byvar["현행(ATR)"])
        if not base.get("n"):
            continue
        cells = []
        for lab in labels:
            s = summarize(byvar[lab])
            cells.append(f"{s['exp_r']:>+9.3f}({s['n']:>3})" if s.get("n") else f"{'-':>13}")
            if s.get("n"):
                g = evaluate_gate(byvar[lab], thr)
                if g.passed:
                    pass_count[lab] += 1
                if lab != "현행(ATR)" and s["exp_r"] > base["exp_r"]:
                    better[lab] += 1
        print(f"{setup:<20}{style:<10}" + "".join(cells))

    print("\n" + "=" * 100)
    print("요약")
    print("=" * 100)
    print(f"{'변형':<14}{'게이트 통과':>12}{'현행보다 나은 조합':>20}")
    for lab in labels:
        b = "-" if lab == "현행(ATR)" else f"{better[lab]}"
        print(f"{lab:<14}{pass_count[lab]:>12}{b:>20}")

    print("\n승률·평균이익/평균손실 (전 조합 합산):")
    print(f"{'변형':<14}{'거래수':>8}{'승률':>8}{'기대값R':>10}{'평균이익':>10}{'평균손실':>10}")
    for lab in labels:
        allt = [t for byvar in acc.values() for t in byvar[lab]]
        s = summarize(allt)
        if s.get("n"):
            print(f"{lab:<14}{s['n']:>8}{s['win']*100:>7.1f}%{s['exp_r']:>+10.3f}"
                  f"{s['avg_win']:>+10.2f}{s['avg_loss']:>+10.2f}")


if __name__ == "__main__":
    main()
