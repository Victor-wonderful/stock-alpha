"""플레이북 탐지 + 시그널 생성 검증 (네트워크 없음)."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from engine.signals import playbooks
from engine.signals.generate import generate_signals


def _mk(opens, highs, lows, closes, vols):
    return pd.DataFrame({
        "open": opens, "high": highs, "low": lows, "close": closes, "volume": vols,
    }, dtype=float)


def _uptrend(n=60, start=100.0, step=1.5):
    closes = np.array([start + i * step for i in range(n)])
    return _mk(closes - 0.5, closes + 1.0, closes - 1.0, closes, np.full(n, 1000.0))


# ── 주도주 추세 ──
def test_leader_trend_triggers_on_uptrend():
    df = _uptrend()
    c = playbooks.detect_leader_trend(df)
    assert c is not None and c.setup == "leader_trend" and c.side == "buy"


def test_leader_trend_rs_rank_boosts_strength():
    df = _uptrend()
    base = playbooks.detect_leader_trend(df, rs_rank=0.5)
    boosted = playbooks.detect_leader_trend(df, rs_rank=0.9)
    assert boosted.strength > base.strength


def test_leader_trend_no_trigger_on_downtrend():
    df = _uptrend()
    df = df.iloc[::-1].reset_index(drop=True)  # 하락 반전
    assert playbooks.detect_leader_trend(df) is None


# ── 과대낙폭 반등 ──
def test_oversold_bounce_triggers():
    # 투매(30봉 급락) 후 강한 반전 양봉(거래량 동반) — 새 역추세 조건 충족
    decline = list(np.linspace(100, 62, 30))
    closes = decline + [64.0]                       # 반전봉 종가(+3.2%)
    opens = [c + 0.3 for c in decline] + [62.2]     # 반전봉 양봉(close>open)
    highs = [c + 0.5 for c in decline] + [64.2]     # 종가 고가권
    lows = [c - 0.5 for c in decline] + [61.9]
    vols = [1000.0] * 30 + [2500.0]                 # 거래량 급증
    df = _mk(opens, highs, lows, closes, vols)
    c = playbooks.detect_oversold_bounce(df)
    assert c is not None and c.setup == "oversold_bounce"


def test_oversold_no_trigger_on_weak_bounce():
    # 과매도·투매여도 반전 확인이 약하면(전일 종가 +1% 미만, 종가 저가권) 트리거 안 함.
    decline = list(np.linspace(100, 62, 30))
    closes = decline + [62.2]                        # +0.3% — 약한 반등
    opens = [c + 0.3 for c in decline] + [62.1]
    highs = [c + 0.5 for c in decline] + [63.5]      # 종가가 고가권 아님
    lows = [c - 0.5 for c in decline] + [61.9]
    vols = [1000.0] * 30 + [2500.0]
    df = _mk(opens, highs, lows, closes, vols)
    assert playbooks.detect_oversold_bounce(df) is None


# ── 쌍바닥(W) ──
def test_double_bottom_triggers():
    import numpy as np
    # 1차 바닥(~80) → 넥라인(~93) → 2차 바닥(~81, 최근) → 거래량 동반 반등 양봉
    closes = (
        list(np.linspace(100, 80, 9))
        + list(np.linspace(81, 93, 10))
        + list(np.linspace(92, 81, 18))
        + list(np.linspace(81.5, 82.5, 4))
        + [84.0]
    )
    opens = closes[:-1] + [82.0]
    highs = [c + 1 for c in closes[:-1]] + [84.5]
    lows = [c - 1 for c in closes[:-1]] + [81.8]
    vols = [1000.0] * (len(closes) - 1) + [2200.0]
    df = _mk(opens, highs, lows, closes, vols)
    c = playbooks.detect_double_bottom(df)
    assert c is not None and c.setup == "double_bottom"
    assert c.support < c.entry_ref < c.resistance  # 2차 바닥 < 진입 < 넥라인


# ── 기준봉 눌림 ──
def test_anchor_pullback_triggers():
    import numpy as np
    # 신고가 장대양봉(기준봉, 대량) → 하위 35% 지지 얕은 눌림 → 거래량 동반 반등
    pull = list(np.linspace(108, 105, 7))
    closes = [100.0] * 36 + [110.0] + pull + [107.0]
    opens = [100.0] * 36 + [100.0] + list(np.linspace(107, 106, 7)) + [105.0]
    highs = [101.0] * 36 + [111.0] + [c + 1 for c in pull] + [107.5]
    lows = [99.0] * 36 + [99.5] + [c - 1 for c in pull] + [104.5]
    vols = [1000.0] * 36 + [5000.0] + [1500.0] * 7 + [1500.0]
    df = _mk(opens, highs, lows, closes, vols)
    c = playbooks.detect_anchor_pullback(df)
    assert c is not None and c.setup == "anchor_pullback"
    assert c.support < c.entry_ref < c.resistance  # 눌림 저점 < 진입 < 기준봉 고점


# ── 돌파 ──
def test_breakout_triggers_with_volume():
    closes = [100.0] * 24 + [106.0]
    highs = [101.0] * 24 + [106.5]
    vols = [1000.0] * 24 + [3000.0]
    df = _mk([100.0] * 25, highs, [99.0] * 25, closes, vols)
    c = playbooks.detect_breakout(df, lookback=20)
    assert c is not None and c.setup == "breakout"
    assert c.support == 101.0  # 돌파 레벨이 지지로


def test_breakout_no_trigger_without_volume():
    closes = [100.0] * 24 + [106.0]
    highs = [101.0] * 24 + [106.5]
    vols = [1000.0] * 25  # 거래량 증가 없음
    df = _mk([100.0] * 25, highs, [99.0] * 25, closes, vols)
    assert playbooks.detect_breakout(df, lookback=20) is None


# ── 종가베팅 ──
def test_close_betting_triggers():
    df = _mk([100.0] * 19 + [100.0], [101.0] * 19 + [106.0],
             [99.0] * 19 + [99.0], [100.0] * 19 + [105.0],
             [1000.0] * 19 + [2000.0])
    c = playbooks.detect_close_betting(df)
    assert c is not None and c.setup == "close_betting"
    assert c.style == "day" and c.session == "close"


# ── 시그널 생성 (조립) ──
def test_generate_signals_assembles_rows():
    df = _uptrend()
    rows = generate_signals(df, instrument_id=5, risk_per_trade_pct=1.0, rs_rank=0.9)
    assert len(rows) >= 1
    r = next(r for r in rows if r["setup"] == "leader_trend")
    assert r["instrument_id"] == 5
    assert r["signal_type"] == "buy"
    assert r["style"] == "position"  # 2026-06-13 비용 반영 재설계: 추세셋업 position 전환
    assert r["session"] == "regular"
    assert r["stop_loss"] < r["entry_price"] < r["tp1"]
    assert r["source_version"] == "signal-v1"
    assert r["llm_rationale"]


def test_generate_signals_matrix_emits_per_passing_style():
    """styles_by_setup 주어지면 한 트리거가 통과 스타일마다 1행 발행 (매트릭스)."""
    df = _uptrend()
    rows = generate_signals(
        df, instrument_id=5, risk_per_trade_pct=1.0, rs_rank=0.9,
        styles_by_setup={"leader_trend": ["swing", "position"]},
    )
    lt = [r for r in rows if r["setup"] == "leader_trend"]
    styles = {r["style"] for r in lt}
    assert styles == {"swing", "position"}, f"두 스타일 모두 발행돼야: {styles}"
    # 각 행의 holding_horizon 이 스타일에 맞게 다르게 산출됨
    by_style = {r["style"]: r for r in lt}
    assert by_style["swing"]["holding_horizon"] != by_style["position"]["holding_horizon"]


def test_generate_signals_close_betting_valid_until_is_close():
    now = datetime(2026, 6, 5, 10, 0, tzinfo=timezone.utc)
    close = datetime(2026, 6, 5, 6, 30, tzinfo=timezone.utc)  # 한국 장마감(UTC)
    df = _mk([100.0] * 19 + [100.0], [101.0] * 19 + [106.0],
             [99.0] * 19 + [99.0], [100.0] * 19 + [105.0],
             [1000.0] * 19 + [2000.0])
    rows = generate_signals(df, instrument_id=1, setups=["close_betting"],
                            now=now, market_close=close)
    assert len(rows) == 1
    # 종가베팅(day, intraday_only) → valid_until 은 장마감 기준
    assert rows[0]["valid_until"] is not None


def test_generate_signals_filter_setups():
    df = _uptrend()
    rows = generate_signals(df, instrument_id=1, setups=["oversold_bounce"])
    # 상승추세엔 과대낙폭 트리거 없음
    assert rows == []


# ── 기간 카탈로그 (단기·중기·장기) ──
# 사고파는 규칙의 단일 출처. 손절을 나누지 않는다는 원칙이 코드로 지켜지는지 본다.

def test_horizon_profiles_cover_three_periods():
    from engine.signals.horizons import HORIZONS, all_profiles

    profs = all_profiles()
    assert [p.horizon for p in profs] == list(HORIZONS)
    assert [p.bars for p in profs] == sorted(p.bars for p in profs), "기간은 짧은 순"
    assert profs[0].bars < profs[-1].bars


def test_short_horizon_is_single_entry():
    """단기는 나눠 살 시간이 없다 — 시가에 전량."""
    from engine.signals.horizons import get_profile

    p = get_profile("short")
    assert p.scale_in is None
    assert p.scaleout is False
    assert "전량" in p.entry_desc


def test_mid_and_long_scale_in_weights_sum_to_one():
    """분할 비중 합이 1이 아니면 «계획 포지션»이 어긋나 R 계산이 깨진다."""
    from engine.signals.horizons import get_profile

    for h in ("mid", "long"):
        p = get_profile(h)
        assert p.scale_in is not None
        assert sum(w for w, _ in p.scale_in) == pytest.approx(1.0)
        assert p.scale_in[0][1] == 0.0, "1차는 시가 진입(하락배수 0)"
        drops = [d for _, d in p.scale_in]
        assert drops == sorted(drops), "차수가 내려갈수록 낮은 가격"


def test_entry_desc_reads_as_a_plan():
    from engine.signals.horizons import get_profile

    assert get_profile("mid").entry_desc == "다음 거래일 시가 50% · −1×ATR 50%"


def test_setup_override_applies():
    from engine.signals import horizons as hz

    hz.SETUP_OVERRIDES["_test_setup"] = {"short": {"bars": 7}}
    try:
        assert hz.get_profile("short", "_test_setup").bars == 7
        assert hz.get_profile("short").bars != 7           # 기본값은 그대로
    finally:
        hz.SETUP_OVERRIDES.pop("_test_setup", None)


def test_all_horizons_use_trail_on_target():
    """목표는 «파는 트리거»가 아니라 «손절을 올리는 트리거»다 — 파는 건 기간이 한다.

    12개 비교에서 예외 없이 trail 이 이겼다(2026-08-21). 이게 sell 로 돌아가면
    상방이 목표에서 잘려 기대값이 절반 이하가 된다.
    """
    from engine.signals.horizons import all_profiles

    assert all(p.target_action == "trail" for p in all_profiles())


# ── 기간별 발행 (horizons_by_setup) ──

def test_generate_signals_emits_one_row_per_horizon():
    """한 트리거가 통과 기간마다 1행 — 손절·목표는 그 기간 프로파일로 산출된다."""
    from engine.signals.horizons import get_profile

    df = _uptrend()
    rows = generate_signals(
        df, instrument_id=3, risk_per_trade_pct=1.0, rs_rank=0.9,
        horizons_by_setup={"leader_trend": ["short", "long"]},
    )
    lt = [r for r in rows if r["setup"] == "leader_trend"]
    assert {r["horizon"] for r in lt} == {"short", "long"}
    by = {r["horizon"]: r for r in lt}
    # 기간마다 보유상한 표기가 다르다
    assert by["short"]["holding_horizon"] == f"{get_profile('short').bars}거래일"
    assert by["long"]["holding_horizon"] == f"{get_profile('long').bars}거래일"
    # 장기는 손절 배수가 커서(2.5×ATR) 손절이 더 멀다
    assert by["long"]["stop_loss"] < by["short"]["stop_loss"]
    # 매매 규칙이 payload 에 실려 화면이 문구를 만들 수 있다
    assert by["long"]["level_payload"]["scale_in"] is not None
    assert by["short"]["level_payload"]["target_action"] == "trail"


def test_horizon_style_mapping_keeps_enum_valid():
    """signals.style 은 enum 이라 기간 값을 담을 수 없다 — 반드시 유효한 스타일로."""
    from engine.signals.horizons import HORIZONS, HORIZON_STYLE
    from engine.signals.styles import STYLES

    assert set(HORIZON_STYLE) == set(HORIZONS)
    assert all(v in STYLES for v in HORIZON_STYLE.values())


def test_horizons_take_precedence_over_styles():
    df = _uptrend()
    rows = generate_signals(
        df, instrument_id=3, rs_rank=0.9,
        styles_by_setup={"leader_trend": ["swing", "position"]},
        horizons_by_setup={"leader_trend": ["short"]},
    )
    lt = [r for r in rows if r["setup"] == "leader_trend"]
    assert len(lt) == 1 and lt[0]["horizon"] == "short"
