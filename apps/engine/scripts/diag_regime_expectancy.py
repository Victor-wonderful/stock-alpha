"""진단: (셋업 × 스타일 × 진입일 국면)별 기대값 — 억제 규칙의 근거를 다시 잰다.

왜 지금 필요한가 (2026-08-21) —
  게이트를 open 으로 바꾸자 통과 조합이 **역추세 swing 3개**(oversold_bounce·
  double_bottom·capitulation)만 남았다. 그런데 억제 규칙은 `range`(횡보)에서
  **역추세를 통째로 막는다**. range 에서 허용되는 건 평균회귀(sigma·quantile)뿐인데
  그 둘은 게이트를 통과한 적이 없다(-0.256 / +0.048).
  → **횡보장은 구조적으로 영구 빈 날이다.** 오늘(8/21)이 정확히 그 날이었다.

억제 규칙의 4국면 라우팅은 "추세장=추세추종 / 횡보=평균회귀 / 하락=역추세"라는
교과서적 분류에서 나왔지, 국면별 실측에서 나온 게 아니다. 특히 **과대낙폭 반등은
본질적으로 평균회귀**인데 «역추세» 상자에 들어갔다는 이유로 횡보장에서 막힌다.

⚠️ 그렇다고 바로 풀면 안 된다 — [[stock-alpha-regime-suppression]] 의 교훈:
  "하락장이 더 좋으니 풀자"는 결론이 최근 구간에서 뒤집혔다(median +0.489 → -0.403).
  그래서 이 스크립트는 **국면별 × 최근/과거 구간**을 함께 낸다. 최근 구간이 빠지면
  조용히 반대 결론이 나온다.

## 국면을 어떻게 복원하나

market_regime 테이블에는 최근 47행뿐이고 market_state 가 있는 건 21행이다(2026-06-25~).
백테스트 트레이드는 500거래일에 걸쳐 있으므로 그대로는 분류가 안 된다. 그래서
**engine.market.regime.compute_regime 을 날짜별로 다시 돌려** 국면 시계열을 복원한다.
같은 순수 함수를 쓰므로 라이브 판정과 정의가 어긋나지 않는다.

실행 (apps/engine 에서):
    python -m scripts.diag_regime_expectancy
    python -m scripts.diag_regime_expectancy --setups oversold_bounce,double_bottom
    python -m scripts.diag_regime_expectancy --recent-bars 60
"""
from __future__ import annotations

import argparse
import statistics as st
from collections import defaultdict

import pandas as pd

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GATE_ENTRY_MODE, GateThresholds, evaluate_gate
from engine.backtest.runner import _load_active_frames
from engine.liquidity import filter_liquid_frames
from engine.logging import get_logger
from engine.market.regime import compute_regime
from engine.signals import playbooks
from engine.signals.horizons import HORIZONS, backtest_kwargs, get_profile

log = get_logger(__name__)

# range 결정에 필요한 셋업만 기본으로 — 전 조합은 --setups all
DEFAULT_SETUPS = [
    "oversold_bounce", "double_bottom", "capitulation",   # 역추세(현재 게이트 통과)
    "sigma", "quantile",                                  # 평균회귀(range 에서 유일 허용)
    "flow_accumulation", "anchor_pullback",               # range 에서 함께 허용 중
]


def build_state_series(frames: dict[int, pd.DataFrame],
                       flows_by_date: dict[str, dict] | None) -> dict[str, str | None]:
    """날짜 → market_state. 라이브와 같은 compute_regime 을 날짜별로 재실행한다.

    returns_20d 는 그날까지의 20거래일 수익률 단면 — 그 시점 데이터만 쓰므로
    룩어헤드가 없다. (2026-08-22 ER 축 제거로 재료가 방향 하나로 줄었다.)
    """
    closes: dict[str, list[float]] = defaultdict(list)   # date -> 20일 수익률들
    for df in frames.values():
        if "ts" not in df.columns or len(df) < 45:
            continue
        ts = df["ts"].astype(str).str[:10].tolist()
        arr = df["close"].astype(float).tolist()
        for i in range(20, len(arr)):
            if arr[i - 20] > 0:
                closes[ts[i]].append(arr[i] / arr[i - 20] - 1)

    out: dict[str, str | None] = {}
    for d, rets in closes.items():
        if len(rets) < 30:
            continue
        fn = None
        if flows_by_date and d in flows_by_date:
            fn = flows_by_date[d].get("foreign_net")
        out[d] = compute_regime(rets, fn)["market_state"]
    return out


def _summary(rs: list[float]) -> str:
    if not rs:
        return f"{'—':>10}"
    return f"{st.mean(rs):>+7.3f}({len(rs):>4})"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--setups", default=",".join(DEFAULT_SETUPS),
                    help="측정할 셋업 (쉼표 구분, 'all' 이면 전체)")
    ap.add_argument("--recent-bars", type=int, default=60,
                    help="'최근 구간'으로 볼 마지막 거래일 수")
    ap.add_argument("--bars", type=int, default=500)
    # 축 — 발행은 2026-08-22 부터 기간 축이다. style 은 옛 축(비교용).
    ap.add_argument("--axis", choices=["style", "horizon"], default="style",
                    help="셋업을 스타일(swing/position)로 쪼갤지 기간(short/mid/long)으로 쪼갤지")
    args = ap.parse_args()

    frames = filter_liquid_frames(_load_active_frames(bars=args.bars))
    log.info("diag.universe", liquid=len(frames))

    try:
        from engine import db_direct
        dates = sorted({d for df in frames.values()
                        for d in df["ts"].astype(str).str[:10]})
        flows = db_direct.flows_by_date(dates[0], dates[-1])
    except Exception as e:  # noqa: BLE001
        log.warning("diag.flows_failed", error=str(e)[:120])
        flows = None

    states = build_state_series(frames, flows)
    all_dates = sorted(states)
    recent_cut = all_dates[-args.recent_bars] if len(all_dates) > args.recent_bars else None
    from collections import Counter
    print(f"\n국면 복원 {len(states)}일 · 분포 {Counter(states.values())}")
    print(f"최근 구간 기준일: {recent_cut} ~ {all_dates[-1] if all_dates else '—'}\n")

    setups = (list(playbooks.ALL_DETECTORS) if args.setups == "all"
              else [s.strip() for s in args.setups.split(",") if s.strip()])
    from engine.signals.runner import (
        load_disclosures_map, load_earnings_map, load_flows_map,
    )
    flows_map, earnings_map, discl_map = (
        load_flows_map(), load_earnings_map(), load_disclosures_map(),
    )
    costs = default_cost_model()
    thr = GateThresholds()

    STATES = ["uptrend", "downtrend", "range", None]
    axis_label = "기간" if args.axis == "horizon" else "스타일"
    hdr = (f"{'셋업:' + axis_label:<30}" + "".join(f"{str(s or '미상'):>13}" for s in STATES)
           + f"{'최근구간':>13}")
    print("=" * len(hdr))
    print(f"국면별 기대값(R) — 진입일 기준 · entry_mode={GATE_ENTRY_MODE}")
    print("=" * len(hdr))
    print(hdr)
    print("-" * len(hdr))

    for setup in setups:
        if setup not in playbooks.ALL_DETECTORS:
            continue
        # 기간 축에서는 일봉 검증이 불가한 셋업(종가베팅 등)을 건너뛴다 — runner 와 동일.
        if args.axis == "horizon" and not playbooks.testable_styles(setup):
            continue
        axis_values = (HORIZONS if args.axis == "horizon"
                       else playbooks.testable_styles(setup))
        for value in axis_values:
            # 기간 축은 손절·목표·분할진입을 프로파일이 정한다(runner.run 과 같은 경로).
            prof = get_profile(value, setup) if args.axis == "horizon" else None
            extra = backtest_kwargs(prof) if prof else {"scaleout": True}
            trades = []
            for iid, df in frames.items():
                trades += backtest_playbook(
                    df, setup,
                    style_override="swing" if prof else value,
                    costs=costs,
                    entry_mode=GATE_ENTRY_MODE,
                    flows=flows_map.get(iid), earnings=earnings_map.get(iid),
                    disclosures=discl_map.get(iid),
                    **extra,
                )
            if not trades:
                continue
            by_state: dict[str | None, list[float]] = defaultdict(list)
            recent: list[float] = []
            for t in trades:
                d = (t.entry_ts or "")[:10]
                by_state[states.get(d)].append(t.r_multiple)
                if recent_cut and d >= recent_cut:
                    recent.append(t.r_multiple)
            g = evaluate_gate(trades, thr)
            mark = "*" if g.passed else " "
            print(f"{setup + ':' + value:<29}{mark}"
                  + "".join(_summary(by_state.get(s, [])) for s in STATES)
                  + _summary(recent))

    print("\n* = 전체 기간 게이트 통과 · 괄호 안은 거래 수")
    print("⚠️ 국면별 숫자는 «그 국면에서 진입한 거래»의 평균이다. 표본이 적은 칸은")
    print("   해석하지 말 것 — 특히 range 는 국면 자체가 드물다.")


if __name__ == "__main__":
    main()
