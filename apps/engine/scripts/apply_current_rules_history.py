"""과거 전체에 «지금 규칙»을 그대로 적용해 **기간별 성과**를 낸다.

Victor 지시(2026-08-22): 새 규칙 픽이 쌓이기를 기다리지 말고, 과거 데이터에 현재
규칙을 적용해 지금 판정한다.

적용하는 «지금 규칙» — 라이브 발행 경로와 같은 구성요소를 그대로 쓴다:
  · 축      기간(short 5 / mid 10 / long 20거래일)      engine.signals.horizons
  · 진입    다음 거래일 시가 시장가                      gate.GATE_ENTRY_MODE='open'
  · 청산    목표=본전스톱 트리거 · 기간 상한 · 단일 손절  horizons.backtest_kwargs
  · 게이트  현재 통과 조합만                            runner.passed_combos_from_db
  · 국면    진입일 국면으로 억제                        daily._pick_suppressed
  · 모집단  거래대금 10억+ 유동 종목                     engine.liquidity

⚠️ 해석의 한계 — 이 숫자는 «앞으로 이만큼 번다»가 아니다. 규칙을 고를 때 이 구간
   (특히 최근 60거래일)의 성적을 봤으므로 같은 구간에 적용하면 좋게 나오는 쪽으로
   편향된다(in-sample). 진짜 검증은 규칙을 정한 2026-08-22 **이후** 구간이다.
   그래서 «전체 / 최근 60일 / 그 이전» 을 나눠 함께 낸다 — 최근이 유독 좋으면
   그건 실력이 아니라 규칙을 그 구간에 맞춘 흔적이다.

⚠️ 발행 상한(하루 5건·섹터 2건)은 적용하지 않는다. 여기 나오는 건 «게이트와 국면을
   통과한 모든 신호»의 성적이다 — 실제 발행은 그중 점수 상위 5건만 나간다.

실행 (apps/engine 에서):
    python -m scripts.apply_current_rules_history
    python -m scripts.apply_current_rules_history --bars 500 --recent-bars 60
"""
from __future__ import annotations

import argparse
import statistics as st
from collections import defaultdict

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook, precompute_detections
from engine.backtest.gate import GATE_ENTRY_MODE
from engine.backtest.runner import _load_active_frames, passed_combos_from_db
from engine.liquidity import filter_liquid_frames
from engine.logging import get_logger
from engine.reports.daily import _pick_suppressed
from engine.signals.horizons import HORIZONS, backtest_kwargs, get_profile
from engine.signals.runner import (
    load_disclosures_map, load_earnings_map, load_flows_map,
)
from scripts.diag_regime_expectancy import build_state_series

log = get_logger(__name__)

HORIZON_LABEL = {"short": "단기 5일", "mid": "중기 10일", "long": "장기 20일"}


def stat_line(rs: list[float], rets: list[float]) -> str:
    if not rs:
        return f"{'거래 0건':>12}"
    wins = sum(1 for r in rs if r > 0)
    return (f"{len(rs):>6}건  승률 {wins / len(rs) * 100:>4.1f}%  "
            f"평균 {st.mean(rs):>+6.3f}R  중앙 {st.median(rs):>+6.3f}R  "
            f"계좌수익 {st.mean(rets) * 100:>+5.2f}%")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bars", type=int, default=500)
    ap.add_argument("--recent-bars", type=int, default=60)
    args = ap.parse_args()

    frames = filter_liquid_frames(_load_active_frames(bars=args.bars))
    log.info("rules_history.universe", liquid=len(frames))

    try:
        from engine import db_direct
        dates = sorted({d for df in frames.values()
                        for d in df["ts"].astype(str).str[:10]})
        flows_by_date = db_direct.flows_by_date(dates[0], dates[-1])
    except Exception as e:  # noqa: BLE001
        log.warning("rules_history.flows_failed", error=str(e)[:120])
        flows_by_date = None

    states = build_state_series(frames, flows_by_date)
    all_dates = sorted(states)
    recent_cut = (all_dates[-args.recent_bars]
                  if len(all_dates) > args.recent_bars else None)

    combos = passed_combos_from_db()
    pairs = sorted((s, h) for s, hs in combos.items() for h in hs if h in HORIZONS)
    print(f"\n대상 조합 {len(pairs)}개 (현 게이트 통과) · 종목 {len(frames)}개 · "
          f"국면 복원 {len(states)}일")
    print(f"최근 구간 기준일: {recent_cut} ~ {all_dates[-1] if all_dates else '—'}")
    print(f"진입 방식: {GATE_ENTRY_MODE}\n")

    flows_map, earnings_map, discl_map = (
        load_flows_map(), load_earnings_map(), load_disclosures_map(),
    )
    costs = default_cost_model()

    # 셋업당 탐지는 한 번만 — 기간이 달라도 «어디서 신호가 났나»는 같다.
    det_cache: dict[str, dict[int, list]] = {}
    # (기간 → 트레이드), (셋업·기간 → 트레이드)
    by_h: dict[str, list] = defaultdict(list)
    by_combo: dict[tuple[str, str], list] = defaultdict(list)
    dropped = 0

    for setup, horizon in pairs:
        if setup not in det_cache:
            det_cache[setup] = {
                iid: precompute_detections(
                    df, setup, flows=flows_map.get(iid),
                    earnings=earnings_map.get(iid),
                    disclosures=discl_map.get(iid))
                for iid, df in frames.items()
            }
        prof = get_profile(horizon, setup)
        for iid, df in frames.items():
            for t in backtest_playbook(
                df, setup,
                style_override="swing",          # 기간 프로파일이 손절·목표를 정한다
                costs=costs, entry_mode=GATE_ENTRY_MODE,
                flows=flows_map.get(iid), earnings=earnings_map.get(iid),
                disclosures=discl_map.get(iid),
                detections=det_cache[setup].get(iid),
                **backtest_kwargs(prof),
            ):
                d = (t.entry_ts or "")[:10]
                state = states.get(d)
                # 라이브와 같은 억제 함수 — 진입일 국면으로 거른다.
                if _pick_suppressed(setup, state, state == "downtrend", horizon):
                    dropped += 1
                    continue
                by_h[horizon].append((t, d))
                by_combo[(setup, horizon)].append((t, d))
        log.info("rules_history.combo", setup=setup, horizon=horizon,
                 kept=len(by_combo[(setup, horizon)]))

    def split(rows: list) -> tuple[list, list, list]:
        rs = [t.r_multiple for t, _ in rows]
        rets = [t.ret_pct for t, _ in rows]
        rec = [(t.r_multiple, t.ret_pct) for t, d in rows
               if recent_cut and d >= recent_cut]
        old = [(t.r_multiple, t.ret_pct) for t, d in rows
               if not (recent_cut and d >= recent_cut)]
        return list(zip(rs, rets)), rec, old

    print("=" * 96)
    print("지금 규칙을 과거 전체에 적용 — 기간별")
    print("=" * 96)
    for h in HORIZONS:
        rows = by_h.get(h, [])
        allr, rec, old = split(rows)
        print(f"\n  {HORIZON_LABEL[h]}")
        for lab, g in (("전체    ", allr), ("최근 60일", rec), ("그 이전 ", old)):
            print(f"    {lab} " + stat_line([x for x, _ in g], [y for _, y in g]))

    print("\n" + "=" * 96)
    print("셋업 × 기간 (전체 구간)")
    print("=" * 96)
    for (setup, h), rows in sorted(by_combo.items()):
        allr, rec, _ = split(rows)
        rr = [x for x, _ in allr]
        rrec = [x for x, _ in rec]
        wins = sum(1 for x in rr if x > 0)
        print(f"  {setup + ':' + h:<26}{len(rr):>6}건  승률 {wins / len(rr) * 100 if rr else 0:>4.1f}%  "
              f"평균 {st.mean(rr) if rr else 0:>+6.3f}R   "
              f"최근 {st.mean(rrec) if rrec else float('nan'):>+6.3f}R({len(rrec)})")

    print(f"\n국면 억제로 걸러낸 거래 {dropped:,}건")
    print("⚠️ 규칙을 고를 때 이 구간을 봤다 — 최근 구간이 유독 좋으면 실력이 아니라")
    print("   규칙을 그 구간에 맞춘 흔적이다. 진짜 검증은 2026-08-22 이후다.")


if __name__ == "__main__":
    main()
