"""실험: 손절폭을 넓히면 기대값이 올라가는가 (손절이 노이즈 안에 있다는 가설).

가설의 근거 — 무작위 진입 실측(870종목 × 500일, 33,057 표본, 60거래일 보유):

    손절·목표 폭   손절이 «먼저» 맞을 확률   목표 터치 확률
        9%              43.0%                54.8%
       15%              32.6%                54.6%
       20%              24.5%                50.6%
       30%              12.5%                40.3%

손절을 9%→30% 로 넓히면 손절 확률은 3분의 1 토막이 나는데 목표 터치는 조금밖에
안 준다. 이 시장은 일간 «중앙» 수익률의 표준편차가 3.26%p 라 9% 손절이 사흘치
노이즈 안에 있다. 그런데 현행 설계는 구조 손절(_clamp_stop_to_structure)이 지지선까지
당겨 실제 손절폭 중앙값을 **0.99×ATR ≈ 하루치**로 만든다.

⚠️ 그렇다고 "넓히면 낫다"가 자동으로 참은 아니다. 손절을 넓히면 승률은 오르지만 한
번 질 때 크게 진다. 이 프로젝트는 137k 거래에서 **승률을 올렸더니 기대값이 떨어지는**
경우를 이미 확인했다([[winrate-vs-expectancy-tradeoff]]). 그래서 승률이 아니라
**기대값(net R)·MDD·게이트 통과**로 판단한다.

두 축을 함께 본다 — 손절만 넓히면 목표(ATR 배수 고정)가 상대적으로 가까워져 손익비가
바뀌므로, 목표를 R 배수로 묶은 조합도 같이 잰다.

  손절 축: 현행(구조 손절 on) · 구조 off 상태의 1.5/2.0/3.0/4.0×ATR
  목표 축: 현행(ATR 배수) · 2.5R (손절 거리의 2.5배)

backtests 테이블에 **쓰지 않는다** — 운영 게이트를 건드리지 않고 비교만 한다.
채택되면 styles.py/levels.py 를 고치고 정식 백테스트를 돌린다.

실행 (apps/engine 에서):
    python -m scripts.exp_stop_mults                 # 게이트 통과 조합만(빠름)
    python -m scripts.exp_stop_mults --all           # 전 조합(수 시간)
    python -m scripts.exp_stop_mults --stops 2.0,3.0 --no-r-target
"""
from __future__ import annotations

import argparse
import json
import statistics as st
from collections import defaultdict
from pathlib import Path

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GATE_ENTRY_MODE, GateThresholds, evaluate_gate
from engine.backtest.runner import _load_active_frames, passed_combos_from_db
from engine.liquidity import filter_liquid_frames
from engine.logging import get_logger
from engine.signals import playbooks

log = get_logger(__name__)

OUT = Path(__file__).resolve().parents[3] / "var" / "stop_mult_results.jsonl"


def _r_set(tp1: float) -> tuple[float, ...]:
    """tp1 을 R 배수로 주면 tp2·tp3 는 비례 확장(스케일아웃 런 목표)."""
    return (tp1, tp1 * 2.0, tp1 * 3.3)


def summarize(trades, thr: GateThresholds) -> dict:
    if not trades:
        return {"n": 0}
    rs = [t.r_multiple for t in trades]
    wins = [r for r in rs if r > 0]
    g = evaluate_gate(trades, thr)
    return {
        "n": len(rs),
        "win": round(len(wins) / len(rs), 4),
        "exp_r": round(g.expectancy_r or 0.0, 4),
        "mdd": round(g.mdd or 0.0, 4),
        "avg_rr": round(g.avg_rr or 0.0, 4),
        "passed": g.passed,
        "reasons": g.reasons,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="손절폭 실험")
    ap.add_argument("--stops", default="1.5,2.0,3.0,4.0",
                    help="구조 손절 없이 시험할 손절 ATR 배수 (쉼표 구분)")
    ap.add_argument("--no-r-target", action="store_true",
                    help="목표 축(2.5R) 생략 — 손절 축만 본다")
    ap.add_argument("--r-target", type=float, default=2.5,
                    help="목표를 손절 거리의 몇 배로 둘지")
    ap.add_argument("--all", action="store_true",
                    help="전 조합 (기본은 게이트 통과 조합만)")
    ap.add_argument("--bars", type=int, default=500)
    args = ap.parse_args()
    stops = [float(x) for x in args.stops.split(",") if x.strip()]

    # ── 변형 정의 ── (label, kwargs)
    variants: list[tuple[str, dict]] = [("현행", {})]
    for m in stops:
        variants.append((f"{m:g}×ATR", {"stop_atr_mult": m, "struct_stop": False}))
    if not args.no_r_target:
        rt = args.r_target
        variants.append((f"현행+{rt:g}R", {"tp_r_mults": _r_set(rt)}))
        for m in stops:
            variants.append((f"{m:g}×ATR+{rt:g}R", {
                "stop_atr_mult": m, "struct_stop": False, "tp_r_mults": _r_set(rt)}))

    if args.all:
        combos = [(s, st_) for s in playbooks.ALL_DETECTORS
                  for st_ in playbooks.testable_styles(s)]
    else:
        combos = [(s, st_) for s, styles in passed_combos_from_db().items()
                  for st_ in styles]
        if not combos:
            print("게이트 통과 조합이 없다 — --all 로 전 조합을 돌리거나 게이트를 먼저 갱신할 것")
            return

    frames = _load_active_frames(bars=args.bars)
    frames = filter_liquid_frames(frames)
    from engine.signals.runner import (
        load_disclosures_map, load_earnings_map, load_flows_map,
    )
    flows_map, earnings_map, discl_map = (
        load_flows_map(), load_earnings_map(), load_disclosures_map(),
    )
    costs = default_cost_model()
    thr = GateThresholds()
    log.info("exp.start", combos=len(combos), variants=[v[0] for v in variants],
             universe=len(frames), entry_mode=GATE_ENTRY_MODE)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    done: set[tuple[str, str]] = set()
    if OUT.exists():                       # 재개 — 이미 끝낸 조합은 건너뛴다
        for line in OUT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                done.add((r["setup"], r["style"]))
        if done:
            log.info("exp.resume", already=len(done))

    rows: list[dict] = []
    for ci, (setup, style) in enumerate(combos, 1):
        if (setup, style) in done:
            log.info("exp.skip", setup=setup, style=style)
            continue
        by_var: dict[str, list] = defaultdict(list)
        for iid, df in frames.items():
            base_kw = dict(
                setup=setup, style_override=style, costs=costs, scaleout=True,
                entry_mode=GATE_ENTRY_MODE,          # 라이브와 같은 진입 가정
                flows=flows_map.get(iid), earnings=earnings_map.get(iid),
                disclosures=discl_map.get(iid),
            )
            for label, kw in variants:
                by_var[label] += backtest_playbook(df, **base_kw, **kw)
        row = {"setup": setup, "style": style, "entry_mode": GATE_ENTRY_MODE,
               "variants": {lab: summarize(by_var[lab], thr) for lab, _ in variants}}
        rows.append(row)
        with OUT.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        base = row["variants"]["현행"]
        log.info("exp.combo.done", i=ci, of=len(combos), setup=setup, style=style,
                 base_exp=base.get("exp_r"), base_n=base.get("n"))

    _report(variants)


def _report(variants: list[tuple[str, dict]]) -> None:
    if not OUT.exists():
        return
    latest: dict[tuple[str, str], dict] = {}
    for line in OUT.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            latest[(r["setup"], r["style"])] = r
    labels = [lab for lab, _ in variants]

    print("\n" + "=" * 108)
    print("조합별 기대값(R) — 손절폭을 바꾸면 어떻게 되나")
    print("=" * 108)
    head = f"{'셋업:스타일':<30}" + "".join(f"{lab:>13}" for lab in labels)
    print(head)
    print("-" * len(head))
    for (setup, style), r in sorted(latest.items()):
        cells = []
        for lab in labels:
            v = r["variants"].get(lab) or {}
            cells.append(f"{v['exp_r']:>+9.3f}{'*' if v.get('passed') else ' '}   "
                         if v.get("n") else f"{'-':>13}")
        print(f"{setup + ':' + style:<30}" + "".join(cells))
    print("\n* = 게이트 통과")

    print("\n" + "=" * 108)
    print("요약 (조합 중앙값)")
    print("=" * 108)
    print(f"{'변형':<16}{'게이트 통과':>10}{'기대값 중앙':>12}{'승률 중앙':>10}"
          f"{'MDD 중앙':>10}{'현행보다↑':>10}")
    base_exp = {k: (v["variants"].get("현행") or {}).get("exp_r")
                for k, v in latest.items()}
    for lab in labels:
        vs = [r["variants"][lab] for r in latest.values()
              if (r["variants"].get(lab) or {}).get("n")]
        if not vs:
            continue
        better = sum(
            1 for k, r in latest.items()
            if (r["variants"].get(lab) or {}).get("n")
            and base_exp.get(k) is not None
            and r["variants"][lab]["exp_r"] > base_exp[k]
        )
        print(f"{lab:<16}{sum(1 for v in vs if v['passed']):>10}"
              f"{st.median([v['exp_r'] for v in vs]):>+12.3f}"
              f"{st.median([v['win'] for v in vs]) * 100:>9.1f}%"
              f"{st.median([v['mdd'] for v in vs]) * 100:>9.1f}%"
              f"{'-' if lab == '현행' else better:>10}")


if __name__ == "__main__":
    main()
