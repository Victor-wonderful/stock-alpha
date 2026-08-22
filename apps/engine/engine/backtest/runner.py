"""백테스트 실행 — 플레이북별로 전 종목 백테스트 → 게이트 평가 → backtests 적재.

통과한 셋업 집합(passed_setups)은 시그널 발행 필터로 쓰인다.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pandas as pd

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook, precompute_detections
from engine.backtest.gate import GATE_ENTRY_MODE, GateThresholds, evaluate_gate
from engine.backtest.metrics import Trade, sharpe
from engine.db import get_client, select_all, upsert
from engine.logging import get_logger
from engine.signals import playbooks
from engine.signals.horizons import HORIZONS, backtest_kwargs, get_profile

log = get_logger(__name__)


def _load_ohlcv(instrument_id: int, limit: int = 500) -> pd.DataFrame:
    res = (
        get_client().table("ohlcv").select("ts,open,high,low,close,volume")
        .eq("instrument_id", instrument_id).eq("interval", "1d")
        .order("ts", desc=True).limit(limit).execute()
    )
    rows = list(reversed(res.data or []))
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    out = df[["open", "high", "low", "close", "volume"]].astype(float)
    out["ts"] = df["ts"]  # 트레이드 진입시점 기록용(시간순 MDD)
    return out


def _load_active_frames(bars: int = 500) -> dict[int, pd.DataFrame]:
    """활성 종목 일봉 {iid: df} — 직접 PG 벌크(단일쿼리) 우선, 실패 시 REST 폴백.

    원격 DB 지연 회피: 종목별 REST(수천 왕복) 대신 한 번의 스트리밍 쿼리.
    """
    from engine import db_direct
    if db_direct.available():
        try:
            return db_direct.load_all_ohlcv_1d(bars=bars)
        except Exception as e:  # noqa: BLE001
            log.warning("backtest.direct_pg_failed_fallback_rest", error=str(e)[:140])
    inst = select_all("instruments", "id", eq={"active": True})
    frames = {it["id"]: _load_ohlcv(it["id"], limit=bars) for it in inst}
    return {k: v for k, v in frames.items() if not v.empty}


def run(
    thresholds: GateThresholds | None = None, *, scaleout: bool = True,
    entry_mode: str = GATE_ENTRY_MODE, axis: str = "style",
    setups: list[str] | None = None,
) -> dict[tuple[str, str], bool]:
    """전 종목·(셋업×스타일) 매트릭스 백테스트 → 조합별 게이트 결과. {(setup,style): passed}.

    각 셋업을 그 셋업이 '논리적으로 허용하고(playbooks.ALLOWED_STYLES) 일봉으로 검증
    가능한(DAILY_TESTABLE_STYLES)' 스타일마다 백테스트한다. 통과한 (셋업×스타일) 조합만
    발행된다 — 같은 셋업이 swing·position 둘 다 통과하면 둘 다 발행. day/scalping 은
    분봉 필요(2단계)라 여기서 평가 대상이 아니다.

    scaleout: 청산 규칙. True(기본)=분할익절(tp1 50%+본전스톱 후 tp2 런) — 라이브
    수명주기(resolve_pick_status)와 동일 규칙. 게이트와 라이브가 같은 청산을 쓰도록
    단일 출처로 둔다(diag_scaleout 검증: 6/7 셋업 net 기대값↑).

    entry_mode: 진입 «체결» 가정. 기본 GATE_ENTRY_MODE="open" (다음 거래일 시가
    시장가) — 라이브 발행과 같은 가정이다. 청산과 마찬가지로 진입도 게이트와
    라이브가 어긋나면 안 된다: 예전 기본값 "signal"(신호가 무조건 체결)은 갭업해
    도망간 종목까지 샀다고 세어, 게이트가 통과시킨 기대값이 라이브에서 하나도
    성립하지 않았다(13조합 전수 비교, 2026-08-20).
    """
    thr = thresholds or GateThresholds()
    frames = _load_active_frames(bars=500)
    # 유동성 필터 — 시그널 발행 유니버스와 동일 모집단으로 백테스트(engine/liquidity).
    from engine.liquidity import filter_liquid_frames
    n_all = len(frames)
    frames = filter_liquid_frames(frames)
    log.info("backtest.universe", total=n_all, liquid=len(frames))

    from engine.signals.runner import (
        load_disclosures_map,
        load_earnings_map,
        load_flows_map,
    )
    flows_map = load_flows_map()
    earnings_map = load_earnings_map()
    discl_map = load_disclosures_map()

    prev = _load_prev_verdicts(entry_mode)

    costs = default_cost_model()
    log.info("backtest.costs", commission_pct=costs.commission_pct,
             tax_pct=costs.tax_pct, slippage_pct=costs.slippage_pct)

    passed: dict[tuple[str, str], bool] = {}
    bt_rows: list[dict] = []
    # 평가 축 — 전환 중이라 둘을 함께 지원한다.
    #   axis="style"   (기본·라이브) 셋업 × 스타일(swing/position). 발행 경로가 아직
    #                  스타일로 돌아가므로 라이브 게이트는 이쪽이어야 «게이트와 발행이
    #                  같은 것을 재는» 상태가 유지된다.
    #   axis="horizon" (마이그레이션) 셋업 × 기간(short/mid/long). 기간마다 사고파는
    #                  규칙이 달라(분할 진입·본전스톱) 프로파일에서 인자를 받는다.
    # ⚠️ 시그널·픽이 horizon 을 싣게 되면 기본값을 "horizon" 으로 바꾸고 style 경로를
    #    지운다. 그전에 기본값을 바꾸면 픽 게이트가 plan.style 과 대조하다 하나도
    #    못 맞춰 «조용히 0건»이 된다(docs/HORIZON_DESIGN.md 마이그레이션 순서).
    # setups 를 주면 그것만 — 중단된 실행을 이어서 돌릴 때 쓴다(셋업별로 즉시 적재되므로
    # 이미 끝난 것을 다시 계산할 이유가 없다).
    for setup in (setups or list(playbooks.ALL_DETECTORS)):
        if setup not in playbooks.ALL_DETECTORS:
            continue
        if axis == "horizon" and not playbooks.testable_styles(setup):
            continue                      # 일봉으로 검증 불가(종가베팅 등)
        axis_values = (HORIZONS if axis == "horizon"
                       else playbooks.testable_styles(setup))
        # 탐지는 축 값과 무관하다 — 한 번 계산해 모든 값에서 재사용한다.
        # (셋업당 870종목 × 500봉 = 43만 번을 축 값 수만큼 반복하던 것을 1회로)
        det_cache: dict[int, list] = {}
        if len(axis_values) > 1:
            for iid, df in frames.items():
                det_cache[iid] = precompute_detections(
                    df, setup, flows=flows_map.get(iid),
                    earnings=earnings_map.get(iid),
                    disclosures=discl_map.get(iid))
        for value in axis_values:
            prof = get_profile(value, setup) if axis == "horizon" else None
            extra = backtest_kwargs(prof) if prof else {"scaleout": scaleout}
            trades: list[Trade] = []
            for iid, df in frames.items():
                trades.extend(
                    backtest_playbook(
                        df, setup,
                        flows=flows_map.get(iid),
                        earnings=earnings_map.get(iid),
                        disclosures=discl_map.get(iid),
                        costs=costs,
                        # 기간 축에서는 손절·목표를 프로파일이 정하므로 스타일은 고정
                        style_override="swing" if prof else value,
                        entry_mode=entry_mode,
                        detections=det_cache.get(iid),
                        **extra,
                    )
                )
            # 시간순 정렬 — MDD 는 순서 민감(시간순 = 실제 시퀀스).
            trades.sort(key=lambda t: t.entry_ts)
            gr = evaluate_gate(trades, thr)
            gross_exp = (
                round(sum(t.r_gross for t in trades) / len(trades), 4)
                if trades else None
            )
            cost_drag = (
                round(gross_exp - gr.expectancy_r, 4)
                if gross_exp is not None and gr.expectancy_r is not None else None
            )
            key = (setup, value)
            effective = apply_hysteresis(gr.passed, prev.get(key))
            passed[key] = effective
            bt_rows.append({
                "strategy_key": f"playbook:{setup}:{value}",
                "setup": setup,
                # ⚠️ style 은 enum(trade_style) 이다 — 기간 값("short")을 넣으면
                # 22P02 로 적재 전체가 실패한다(2026-08-22 실제로 겪음).
                # 기간 축에서는 style 을 비우고 horizon 컬럼만 쓴다.
                "style": value if not prof else None,
                "horizon": value if prof else None,
                "params": {"thresholds": thr.__dict__, "costs": costs.__dict__,
                           "gross_expectancy_r": gross_exp,
                           "entry_mode": entry_mode,
                           "axis": axis,
                           "horizon_bars": prof.bars if prof else None,
                           "scale_in": prof.scale_in if prof else None,
                           "target_action": prof.target_action if prof else "sell",
                           "walkforward": gr.walkforward},
                "sharpe": sharpe([t.ret_pct for t in trades]),
                "mdd": gr.mdd,
                "win_rate": gr.win_rate,
                "avg_rr": gr.avg_rr,
                "expectancy_r": gr.expectancy_r,  # 비용 차감 net
                "passed": effective,
                "passed_raw": gr.passed,
                "period": "daily-history",
            })
            if effective != gr.passed:
                log.info("backtest.gate.held", setup=setup, axis_value=value,
                         raw=gr.passed, held=effective)
            wf = gr.walkforward or {}
            log.info("backtest.setup", setup=setup, axis_value=value, passed=effective,
                     raw=gr.passed, n=gr.n_trades, gross_exp=gross_exp,
                     net_exp=gr.expectancy_r, cost_drag=cost_drag,
                     mdd=gr.mdd, wf_eval=wf.get("evaluable"),
                     wf_pos_frac=wf.get("positive_frac"),
                     wf_recent=wf.get("recent_expectancy_r"), reasons=gr.reasons)

        # 셋업 하나가 끝날 때마다 적재한다. 예전엔 전부 끝난 뒤 한 번에 넣어서,
        # 마지막에 실패하면 두 시간짜리 계산이 통째로 날아갔다(2026-08-22).
        if bt_rows:
            upsert("backtests", bt_rows)
            bt_rows = []

    if bt_rows:                       # 남은 잔여분(방어)
        upsert("backtests", bt_rows)
    return passed


def _load_prev_verdicts(entry_mode: str = GATE_ENTRY_MODE) -> dict[tuple[str, str], dict]:
    """(셋업×스타일)별 직전 런 판정 {(setup,style): {passed, passed_raw}}.

    style 없는 옛 행(매트릭스 이전)은 매칭 안 됨 → 첫 측정으로 취급(무해).

    ⚠️ **같은 진입 가정(entry_mode)으로 잰 행만 본다.** 히스테리시스는 "2회 연속
    같은 원측정일 때만 상태를 바꾼다" 이므로, 가정이 바뀐 첫 런에서 옛 가정의
    판정을 직전 값으로 쓰면 **이번에 탈락한 조합이 한 런 더 통과로 유지된다** —
    signal→open 전환에서는 그게 곧 «라이브 기대값이 마이너스인 조합을 하루 더
    발행»하는 것이다. 가정이 다르면 비교 대상이 아니다(옛 행은 entry_mode 키가
    없어 자연히 제외된다).
    """
    latest: dict[tuple[str, str], dict] = {}
    rows = sorted(
        select_all("backtests",
                   "setup,style,horizon,passed,passed_raw,params,created_at"),
        key=lambda b: b.get("created_at") or "",
    )
    for bt in rows:
        axis_value = bt.get("horizon") or bt.get("style")
        if not (bt.get("setup") and axis_value):
            continue
        if ((bt.get("params") or {}).get("entry_mode")) != entry_mode:
            continue
        latest[(bt["setup"], axis_value)] = bt
    return latest


HORIZON_AXIS = frozenset({"short", "mid", "long"})


def drop_superseded_style_rows(
    latest: dict[tuple[str, str], dict],
) -> dict[tuple[str, str], dict]:
    """기간 판정이 있는 셋업에서 «옛 스타일 축» 행을 버린다. (순수 함수)

    왜 필요한가 (2026-08-22) — backtests 에는 두 세대가 섞여 있다(옛 style 1,518행 /
    새 horizon 66행). 최신행 맵의 키가 (setup, 축값) 이라 «(capitulation, swing)» 과
    «(capitulation, short)» 가 **서로 다른 키로 공존**한다. 그래서

      · 기간 축에서 탈락한 셋업이 두 달 전 swing 행 덕에 통과로 남고,
      · horizon 없는 옛 플랜이 그 옛 swing 행에 대조돼 발행된다
        (_plan_gate_ok 의 style 폴백) — **두 세대가 서로를 검증한다**.

    이건 메모리의 «61커밋 뒤처진 배포가 6주간 추세픽을 통과시킨» 사고와 같은 종류다.
    같은 셋업에 새 축 판정이 하나라도 있으면 그게 옛 축을 대체한 것으로 본다.

    ⚠️ 적용 시점(2026-08-22) 실측으로 통과 셋업 집합은 바뀌지 않는다(10개 동일).
       바뀌는 건 passed_combos 의 축값에서 'swing' 3건이 빠지는 것 — 재발 차단이 목적.
    """
    superseded = {setup for (setup, axis) in latest if axis in HORIZON_AXIS}
    return {
        (setup, axis): bt
        for (setup, axis), bt in latest.items()
        if not (setup in superseded and axis not in HORIZON_AXIS)
    }


def apply_hysteresis(raw: bool, prev: dict | None) -> bool:
    """게이트 히스테리시스 (순수) — 경계선 셋업의 일일 PASS/FAIL 플립 억제.

    상태 변경은 '2회 연속 같은 원측정'일 때만:
      · 이번 측정 == 직전 안정화 판정 → 유지 (변화 없음)
      · 다르면, 직전 런의 원측정도 같은 방향이었을 때만 상태 전환
      · 첫 측정(이전 기록 없음)은 그대로 채택
    """
    if prev is None:
        return raw
    prev_eff = bool(prev.get("passed"))
    prev_raw = prev.get("passed_raw")
    prev_raw = prev_eff if prev_raw is None else bool(prev_raw)
    if raw == prev_eff:
        return raw
    return raw if prev_raw == raw else prev_eff


def passed_combos(thresholds: GateThresholds | None = None) -> dict[str, list[str]]:
    """게이트 통과 (셋업→통과 스타일 목록). 재백테스트 실행. 시그널 발행 필터용."""
    out: dict[str, list[str]] = {}
    for (setup, style), ok in run(thresholds).items():
        if ok:
            out.setdefault(setup, []).append(style)
    return out


def passed_setups(thresholds: GateThresholds | None = None) -> list[str]:
    """게이트를 어떤 스타일로든 통과한 셋업 목록 (셋업 단위 소비처용)."""
    return list(passed_combos(thresholds).keys())


def passed_combos_from_db(as_of: str | None = None) -> dict[str, list[str]]:
    """backtests 최신 행 기준 통과 (셋업→**기간** 목록) — 재백테스트 없이 read.

    2026-08-22 부터 축이 «스타일»에서 «기간»(short/mid/long)으로 바뀌었다. horizon
    컬럼이 있으면 그걸 쓰고, 없는 옛 행은 style 로 폴백한다 — 전환 중 두 세대가
    섞여 있어도 조용히 틀리지 않게.

    daily 배치/signals --gate 발행 필터용. 직전 backtest 런이 적재한 안정화 판정 사용.

    as_of: 주면 그 날(KST 종료) 이전에 적재된 행만 본다 — 과거일 픽 백필에서
      '지금 통과한 조합'을 쓰면 나중에 좋아진 걸 알고 고르는 셈이 된다.
      backtests 는 매 배치일 적재되므로 당시 게이트가 그대로 복원된다.
    """
    cutoff = gate_cutoff(as_of)
    latest: dict[tuple[str, str], dict] = {}
    for bt in sorted(
        select_all("backtests", "setup,style,horizon,passed,created_at"),
        key=lambda b: b.get("created_at") or "",
    ):
        axis = bt.get("horizon") or bt.get("style")
        if bt.get("setup") and axis and _within(bt, cutoff):
            latest[(bt["setup"], axis)] = bt
    latest = drop_superseded_style_rows(latest)
    out: dict[str, list[str]] = {}
    for (setup, style), bt in latest.items():
        if bt.get("passed"):
            out.setdefault(setup, []).append(style)
    return out


def gate_cutoff(as_of: str | None) -> datetime | None:
    """as_of(KST 날짜) 하루의 끝을 UTC 기준 시각으로. as_of 없으면 None(제한 없음).

    배치는 as_of 당일 백테스트를 돌린 뒤 픽을 고른다 — 그래서 당일 적재분까지 포함이다.
    """
    if not as_of:
        return None
    kst = timezone(timedelta(hours=9))
    d = date.fromisoformat(as_of)
    return datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=kst)


def _within(bt: dict, cutoff: datetime | None) -> bool:
    """행의 created_at 이 cutoff 이하인가. cutoff 없으면 항상 True."""
    if cutoff is None:
        return True
    raw = bt.get("created_at")
    if not raw:
        return False
    try:
        ts = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts <= cutoff
