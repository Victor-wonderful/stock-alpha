"""지난 1년, «새 규칙으로 발행했다면» 나왔을 픽을 재현해 성과 기록을 만든다.

Victor 지시(2026-08-22): 새 픽 규칙의 성과를 지금 만들어라. 기간은 지난 1년.

앞서 만든 apply_current_rules_history 와 다른 점 —
그쪽은 «게이트·국면을 통과한 **모든 신호**»의 통계다(단기만 4,792건). 이 스크립트는
거기서 한 단계 더 가서 **실제 발행 규칙**을 적용한다: 하루 최대 PICKS_MAX 건, 한
종목 1건. 그래야 «우리 픽의 성적»이 된다.

## 적용하는 규칙 (라이브 발행 경로와 같은 구성요소)

  · 축      기간(short 5 / mid 10 / long 20거래일)   engine.signals.horizons
  · 진입    다음 거래일 시가                        gate.GATE_ENTRY_MODE='open'
  · 청산    목표=본전스톱 트리거 · 기간 상한        horizons.backtest_kwargs
  · 게이트  현재 통과 조합                          runner.passed_combos_from_db
  · 국면    진입일 국면으로 억제                    daily._pick_suppressed
  · 선정    하루 PICKS_MAX 건 · 한 종목 1건          daily.PICKS_MAX

## 두 벌을 낸다

  A. 현재 게이트 그대로 (12조합)
  B. + «최근 60거래일 기대값 ≥ 0» 조건 (엣지 쇠퇴 차단, 5조합)

B 를 함께 내는 이유: 지금 게이트의 워크포워드는 500일을 4등분해 «최근»이 125일이라
두 달 단위 쇠퇴를 못 잡는다. 그 조건을 넣으면 무엇이 달라지는지 숫자로 봐야
런칭 게이트를 정할 수 있다.

## 순위 규칙 (재현의 한계)

라이브는 리포트의 종합점수(0~100)로 종목 간 순위를 매기는데, 과거일 리포트를
새 축으로 다시 만들 수 없다. 그래서 두 단계로 근사한다 —
  1) 조합 기대값이 높은 것 우선 (라이브 _best_plan 과 같은 기준)
  2) 같으면 거래대금이 큰 것 우선 (그 시점에 알 수 있고 결과와 무관하다)
점수 대신 쓰는 근사라는 걸 결과에 함께 적는다.

실행 (apps/engine 에서):
    python -m scripts.backfill_track_record                 # 계산만
    python -m scripts.backfill_track_record --out ../web/lib/backfill-1y.json
    python -m scripts.backfill_track_record --days 250
"""
from __future__ import annotations

import argparse
import json
import statistics as st
from collections import defaultdict
from pathlib import Path

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook, precompute_detections
from engine.backtest.gate import GATE_ENTRY_MODE
from engine.backtest.runner import _load_active_frames, passed_combos_from_db
from engine.liquidity import df_avg_turnover_krw, filter_liquid_frames
from engine.logging import get_logger
from engine.reports.daily import PICKS_MAX, _pick_suppressed, gate_expectancy_from_db
from engine.signals.horizons import HORIZONS, backtest_kwargs, get_profile
from engine.signals.runner import (
    load_disclosures_map, load_earnings_map, load_flows_map,
)
from scripts.diag_regime_expectancy import build_state_series

log = get_logger(__name__)

HORIZON_LABEL = {"short": "단기 5일", "mid": "중기 10일", "long": "장기 20일"}
RECENT_MIN_TRADES = 20     # 최근 구간 판정에 필요한 최소 표본
RECENT_FLOOR = 0.0         # 최근 구간 기대값 하한


def summarize(rows: list[dict], label: str) -> list[dict]:
    """기간별 집계를 찍고 그대로 돌려준다(JSON 스냅샷용)."""
    print(f"\n  {label}")
    out: list[dict] = []
    for h in HORIZONS:
        g = [r for r in rows if r["horizon"] == h]
        rs = [r["r"] for r in g]
        rets = [r["ret"] for r in g]
        stat = {
            "horizon": h,
            "n": len(rs),
            "wins": sum(1 for x in rs if x > 0),
            "meanR": round(st.mean(rs), 4) if rs else None,
            "medianR": round(st.median(rs), 4) if rs else None,
            "meanRetPct": round(st.mean(rets) * 100, 4) if rets else None,
        }
        out.append(stat)
        if not rs:
            print(f"    {HORIZON_LABEL[h]:<10} 발행 0건")
            continue
        print(f"    {HORIZON_LABEL[h]:<10} {len(rs):>4}건  "
              f"승률 {stat['wins'] / len(rs) * 100:>4.1f}%  "
              f"평균 {stat['meanR']:>+6.3f}R  중앙 {stat['medianR']:>+6.3f}R  "
              f"계좌수익 {stat['meanRetPct']:>+5.2f}%")
    rs = [r["r"] for r in rows]
    if rs:
        w = sum(1 for x in rs if x > 0)
        print(f"    {'합계':<10} {len(rs):>4}건  승률 {w / len(rs) * 100:>4.1f}%  "
              f"평균 {st.mean(rs):>+6.3f}R")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=250, help="재현할 거래일 수(기본 1년)")
    ap.add_argument("--warmup", type=int, default=80, help="탐지·ATR 용 앞선 봉")
    ap.add_argument("--out", default=None,
                    help="집계 스냅샷 JSON 경로 (성과 화면이 읽는다)")
    ap.add_argument("--asof", default=None,
                    help="스냅샷 생성일 라벨(YYYY-MM-DD). 재현성을 위해 인자로 받는다")
    args = ap.parse_args()

    frames = filter_liquid_frames(_load_active_frames(bars=args.days + args.warmup))
    log.info("backfill.universe", liquid=len(frames))

    try:
        from engine import db_direct
        all_d = sorted({d for df in frames.values()
                        for d in df["ts"].astype(str).str[:10]})
        flows_by_date = db_direct.flows_by_date(all_d[0], all_d[-1])
    except Exception as e:  # noqa: BLE001
        log.warning("backfill.flows_failed", error=str(e)[:120])
        flows_by_date = None

    states = build_state_series(frames, flows_by_date)
    dates = sorted(states)
    window = dates[-args.days:] if len(dates) > args.days else dates
    start = window[0]
    print(f"\n재현 구간 {start} ~ {window[-1]} ({len(window)}거래일) · 종목 {len(frames)}개")
    print(f"진입 {GATE_ENTRY_MODE} · 하루 최대 {PICKS_MAX}건 · 한 종목 1건")

    combos = passed_combos_from_db()
    pairs = sorted((s, h) for s, hs in combos.items() for h in hs if h in HORIZONS)
    exp = gate_expectancy_from_db()
    turnover = {iid: (df_avg_turnover_krw(df) or 0.0) for iid, df in frames.items()}

    flows_map, earnings_map, discl_map = (
        load_flows_map(), load_earnings_map(), load_disclosures_map(),
    )
    costs = default_cost_model()

    # ── 모든 후보 트레이드 수집 ──
    det_cache: dict[str, dict[int, list]] = {}
    cands: list[dict] = []
    recent_cut = window[-60] if len(window) > 60 else window[0]
    recent_pool: dict[tuple[str, str], list[float]] = defaultdict(list)

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
                df, setup, style_override="swing", costs=costs,
                entry_mode=GATE_ENTRY_MODE,
                flows=flows_map.get(iid), earnings=earnings_map.get(iid),
                disclosures=discl_map.get(iid),
                detections=det_cache[setup].get(iid),
                **backtest_kwargs(prof),
            ):
                d = (t.entry_ts or "")[:10]
                if d < start:
                    continue
                state = states.get(d)
                if _pick_suppressed(setup, state, state == "downtrend", horizon):
                    continue
                if d >= recent_cut:
                    recent_pool[(setup, horizon)].append(t.r_multiple)
                cands.append({
                    "date": d, "iid": iid, "setup": setup, "horizon": horizon,
                    "r": t.r_multiple, "ret": t.ret_pct,
                    "rank_exp": exp.get((setup, horizon), 0.0),
                    "turnover": turnover.get(iid, 0.0),
                })
        log.info("backfill.combo", setup=setup, horizon=horizon, cands=len(cands))

    print(f"\n국면·게이트 통과 후보 {len(cands):,}건")

    # ── 최근 60거래일 기대값으로 «쇠퇴 조합» 판정 ──
    faded: set[tuple[str, str]] = set()
    print("\n조합별 최근 60거래일 기대값 (표본 {}건 이상만 판정)".format(RECENT_MIN_TRADES))
    for key in sorted(set(k for k in recent_pool) | set(pairs)):
        rs = recent_pool.get(key, [])
        if len(rs) < RECENT_MIN_TRADES:
            print(f"  {key[0] + ':' + key[1]:<26} 표본 {len(rs):>4}건 — 판단 보류")
            continue
        m = st.mean(rs)
        bad = m < RECENT_FLOOR
        if bad:
            faded.add(key)
        print(f"  {key[0] + ':' + key[1]:<26} {m:>+7.3f}R ({len(rs):>4}건) "
              f"{'← 쇠퇴' if bad else ''}")

    # ── 하루 상한을 적용해 «발행 픽»을 고른다 ──
    def select(pool: list[dict]) -> list[dict]:
        by_date: dict[str, list[dict]] = defaultdict(list)
        for c in pool:
            by_date[c["date"]].append(c)
        out: list[dict] = []
        for d in sorted(by_date):
            # 조합 기대값 → 거래대금 순. 한 종목은 하루 1건만.
            rows = sorted(by_date[d],
                          key=lambda c: (-c["rank_exp"], -c["turnover"]))
            seen: set[int] = set()
            picked = 0
            for c in rows:
                if c["iid"] in seen:
                    continue
                seen.add(c["iid"])
                out.append(c)
                picked += 1
                if picked >= PICKS_MAX:
                    break
        return out

    a = select(cands)
    b = select([c for c in cands if (c["setup"], c["horizon"]) not in faded])

    print("\n" + "=" * 92)
    print("새 규칙으로 발행했다면 — 지난 1년 성과")
    print("=" * 92)
    stats_a = summarize(a, f"A. 현재 게이트 그대로 ({len(pairs)}조합)")
    stats_b = summarize(b, f"B. + 최근 60일 기대값 ≥ 0 ({len(pairs) - len(faded)}조합)")

    print("\n⚠️ 종목 간 순위는 리포트 점수 대신 «조합 기대값 → 거래대금»으로 근사했다")
    print("   (과거일 리포트를 새 축으로 다시 만들 수 없다). 그 외는 라이브와 같은 코드다.")

    if not args.out:
        print("\n(스냅샷 안 씀 — 저장하려면 --out 경로)")
        return

    recent = {}
    for key in sorted(set(recent_pool) | set(pairs)):
        rs = recent_pool.get(key, [])
        recent[f"{key[0]}:{key[1]}"] = {
            "n": len(rs),
            "meanR": round(st.mean(rs), 4) if len(rs) >= RECENT_MIN_TRADES else None,
            "faded": key in faded,
        }

    snap = {
        "generatedAt": args.asof,
        "start": start,
        "end": window[-1],
        "tradingDays": len(window),
        "universe": len(frames),
        "picksMax": PICKS_MAX,
        "entryMode": GATE_ENTRY_MODE,
        "candidates": len(cands),
        "variants": {
            "current": {"label": "현재 게이트", "combos": len(pairs), "byHorizon": stats_a},
            "recentFloor": {"label": "최근 60일 기대값 ≥ 0",
                            "combos": len(pairs) - len(faded), "byHorizon": stats_b},
        },
        "recentByCombo": recent,
        "caveat": ("종목 간 순위는 리포트 점수 대신 조합 기대값·거래대금으로 근사했다. "
                   "그 외 진입·청산·게이트·국면 억제는 라이브와 같은 코드다."),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n스냅샷 저장 → {out}")


if __name__ == "__main__":
    main()
