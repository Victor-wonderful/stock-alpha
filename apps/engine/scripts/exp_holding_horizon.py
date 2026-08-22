"""실험: 추천을 «보유기간»으로 나누면 어떤 셋업이 어느 기간에 통하는가.

Victor 제안(2026-08-21): "수십 일 보유하면서 목표가·손절가 도착을 기다리는 건 아닌 것
같다. 추천 종목은 기간에 따라 — 1일 보유, 5일 보유, 10일 보유 이렇게."

이 방향이 오늘 측정된 문제들과 맞아떨어진다:
  · position(60봉) 조합이 30개 중 **0개** 생존 — 애초에 60일을 안 쓴다
  · 이기는 픽이 안 끝나 성적을 못 낸다(검열 편향) — 고정 기간이면 전부 완결된다
  · "언제 파나"에 화면이 답을 못 했다 — 추천 자체가 기간으로 분류된다
  · 목표·손절을 기다리다 노이즈에 털린다(9% 손절은 무작위로도 43%가 먼저 맞는다)

## 무엇을 재나

Victor 확인(2026-08-21): "목표가나 손절가에 도달이 되지 않아도 기간별로 매도하는
것이 필요한 것 같다." → **목표·손절은 그대로 두고 보유 상한만 바꾼다.**

  현행           스타일 타임아웃(스윙 10봉) + 목표 + 분할익절 — 지금 발행 규칙
  N일            목표·손절 유지 + **N거래일이 되면 안 닿아도 종가 매도** ← 이번 설계
  N일·목표없음     대조군. 목표를 꺼서 «기간의 효과»만 분리해 본다

대조군을 함께 두는 이유: N일 변형이 좋아졌을 때 그게 «기간을 줄여서»인지 «목표에
먼저 닿아서»인지 구분해야 하기 때문이다. 둘을 안 나누면 원인을 잘못 짚는다.

진입은 라이브와 같은 다음 거래일 시가(entry_mode=open).

스타일은 swing 으로 고정한다 — 스타일이 손절 ATR 배수(1.8)와 목표를 함께 정하는데,
여기서 보고 싶은 건 손절폭이 아니라 **보유기간**이다. 손절폭은 별도 실험
(exp_stop_mults)에서 다뤘다.

## 읽는 법

승률이 아니라 **기대값(net R)**으로 판단한다 — 짧은 기간은 승률이 높게 나오지만
한 번에 먹는 게 작다. 이 프로젝트는 승률을 올렸다가 기대값이 떨어진 전례가 있다
([[winrate-vs-expectancy-tradeoff]]).

실행 (apps/engine 에서):
    python -m scripts.exp_holding_horizon
    python -m scripts.exp_holding_horizon --horizons 1,3,5,10,20 --setups all
"""
from __future__ import annotations

import argparse
import json
import statistics as st
from pathlib import Path

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GATE_ENTRY_MODE, GateThresholds, evaluate_gate
from engine.backtest.runner import _load_active_frames
from engine.liquidity import filter_liquid_frames
from engine.logging import get_logger
from engine.signals import playbooks

log = get_logger(__name__)

OUT = Path(__file__).resolve().parents[3] / "var" / "holding_horizon_results.jsonl"
STYLE = "swing"          # 손절 배수를 한 값으로 고정 — 여기서 보는 건 기간이다


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
        "bars": round(st.mean([t.bars_held for t in trades]), 2),
        "passed": g.passed,
        "reasons": g.reasons,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizons", default="1,3,5,10,20",
                    help="시험할 보유 거래일 (목표·손절 유지, 기간 만료 시 종가 청산)")
    ap.add_argument("--trail", default="",
                    help="목표 도달 시 팔지 않고 본전 스톱으로 전환 — 파는 주체는 기간. "
                         "«목표를 보여주되 기간을 메인으로» 하는 방식")
    ap.add_argument("--notarget", default="3,10",
                    help="대조군 — 목표를 끄고 기간 만료로만 파는 경우 (기간 효과 분리)")
    ap.add_argument("--setups", default="all")
    ap.add_argument("--ignore-style", action="store_true",
                    help="playbooks.testable_styles 제약을 무시하고 swing 으로 잰다. "
                         "position 전용으로 «등록»된 셋업은 짧은 기간에서 재본 적이 "
                         "없어서 그 라벨이 붙은 것이지 검증 결과가 아니다 — 지금 묻는 게 "
                         "'그 기간 배정이 맞나'인데 그 배정 때문에 측정에서 빠지면 순환이다.")
    ap.add_argument("--out", default=None,
                    help="결과 파일 경로 override (동시 실행 시 파일 충돌 방지)")
    ap.add_argument("--bars", type=int, default=500)
    args = ap.parse_args()
    global OUT
    if args.out:
        OUT = Path(args.out)
    horizons = [int(x) for x in args.horizons.split(",") if x.strip()]
    notarget = [int(x) for x in args.notarget.split(",") if x.strip()]
    trail = [int(x) for x in args.trail.split(",") if x.strip()]

    setups = (list(playbooks.ALL_DETECTORS) if args.setups == "all"
              else [s.strip() for s in args.setups.split(",") if s.strip()])
    setups = [s for s in setups
              if s in playbooks.ALL_DETECTORS
              and (args.ignore_style or STYLE in playbooks.testable_styles(s))]

    frames = filter_liquid_frames(_load_active_frames(bars=args.bars))
    from engine.signals.runner import (
        load_disclosures_map, load_earnings_map, load_flows_map,
    )
    flows_map, earnings_map, discl_map = (
        load_flows_map(), load_earnings_map(), load_disclosures_map(),
    )
    costs = default_cost_model()
    thr = GateThresholds()
    # 변형 정의 — (라벨, backtest_playbook kwargs)
    #   "현행"        스타일 타임아웃(스윙 10봉) + 목표 + 분할익절 (지금 발행 규칙)
    #   "N일"         목표·손절 그대로, **기간이 되면 안 닿아도 종가 매도** ← 이번 설계
    #   "N일·목표없음"  대조군. 기간 효과만 분리해 보려고 목표를 끈다
    variants: list[tuple[str, dict]] = [("현행", {"scaleout": True})]
    variants += [(f"{h}일", {"scaleout": True, "timeout_bars": h}) for h in horizons]
    variants += [(f"{h}일·본전스톱",
                  {"scaleout": True, "timeout_bars": h, "target_action": "trail"})
                 for h in trail]
    variants += [(f"{h}일·목표없음",
                  {"scaleout": False, "timeout_bars": h, "use_targets": False})
                 for h in notarget]
    labels = [lab for lab, _ in variants]
    log.info("exp.start", setups=len(setups), horizons=horizons,
             universe=len(frames), entry_mode=GATE_ENTRY_MODE, style=STYLE)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if OUT.exists():
        for line in OUT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(json.loads(line)["setup"])

    for ci, setup in enumerate(setups, 1):
        if setup in done:
            continue
        by: dict[str, list] = {lab: [] for lab in labels}
        for iid, df in frames.items():
            kw = dict(
                setup=setup, style_override=STYLE, costs=costs,
                entry_mode=GATE_ENTRY_MODE, flows=flows_map.get(iid),
                earnings=earnings_map.get(iid), disclosures=discl_map.get(iid),
            )
            for lab, extra in variants:
                by[lab] += backtest_playbook(df, **kw, **extra)
        row = {"setup": setup, "style": STYLE,
               "variants": {lab: summarize(by[lab], thr) for lab in labels}}
        with OUT.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        log.info("exp.setup.done", i=ci, of=len(setups), setup=setup,
                 base=row["variants"]["현행"].get("exp_r"))

    _report(labels)


def _report(labels: list[str]) -> None:
    if not OUT.exists():
        return
    latest: dict[str, dict] = {}
    for line in OUT.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            latest[r["setup"]] = r

    head = f"{'셋업':<20}" + "".join(f"{lab:>14}" for lab in labels)
    print("\n" + "=" * len(head))
    print("보유기간별 기대값(R) — 진입 다음날 시가 · 목표·손절 유지 · 기간 만료 시 종가 매도")
    print("=" * len(head))
    print(head)
    print("-" * len(head))
    for setup, r in sorted(latest.items(),
                           key=lambda kv: -(kv[1]["variants"].get("현행", {}).get("exp_r") or -9)):
        cells = []
        for lab in labels:
            v = r["variants"].get(lab) or {}
            cells.append(f"{v['exp_r']:>+10.3f}{'*' if v.get('passed') else ' '}   "
                         if v.get("n") else f"{'-':>14}")
        print(f"{setup:<20}" + "".join(cells))
    print("\n* = 게이트 통과")

    print("\n" + "=" * len(head))
    print("요약 (셋업 중앙값)")
    print("=" * len(head))
    print(f"{'보유기간':<14}{'게이트 통과':>10}{'기대값 중앙':>12}{'승률 중앙':>10}"
          f"{'MDD 중앙':>10}{'평균 보유':>10}")
    for lab in labels:
        vs = [r["variants"][lab] for r in latest.values()
              if (r["variants"].get(lab) or {}).get("n")]
        if not vs:
            continue
        print(f"{lab:<14}{sum(1 for v in vs if v['passed']):>10}"
              f"{st.median([v['exp_r'] for v in vs]):>+12.3f}"
              f"{st.median([v['win'] for v in vs]) * 100:>9.1f}%"
              f"{st.median([v['mdd'] for v in vs]) * 100:>9.1f}%"
              f"{st.median([v['bars'] for v in vs]):>9.1f}봉")


if __name__ == "__main__":
    main()
