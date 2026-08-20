"""백테스트 진입 체결 모델 (2026-08-20).

예전 백테스트는 신호 봉 가격에 «무조건 체결»된다고 가정했다. 라이브는 다르다 —
픽은 전일 종가를 진입가로 적어 발행되고, 다음 날 그 가격 이하로 내려와야 산다.
실측(발행 픽 48건)에서 손절 픽은 24/24 체결됐는데 목표 픽은 1/3 만 체결됐다.

여기서 고정하는 것: entry_mode 별로 «무엇을 가정하는가»가 실제로 달라진다는 것.
"""
from __future__ import annotations

import pandas as pd
import pytest

from engine.backtest.event_backtest import _find_fill


def _df(rows: list[tuple[float, float, float, float]]) -> pd.DataFrame:
    """(open, high, low, close) 목록 → 봉 프레임."""
    return pd.DataFrame(rows, columns=["open", "high", "low", "close"])


def test_다음_봉_저가가_진입가_이하면_그_봉에서_체결된다():
    df = _df([(100, 101, 99, 100),      # i=0 신호 봉
              (102, 105, 98, 104)])     # i=1 저가 98 ≤ 진입 100
    assert _find_fill(df, 0, len(df), entry=100.0, window=10) == 1


def test_갭업해_도망가면_체결되지_않는다():
    """목표를 찍어도 살 수가 없었던 경우 — 실측 SK스퀘어가 이 모양이었다."""
    df = _df([(100, 101, 99, 100)] + [(110, 120, 108, 118)] * 5)
    assert _find_fill(df, 0, len(df), entry=100.0, window=10) is None


def test_늦게라도_내려오면_그_봉에서_체결된다():
    df = _df([(100, 101, 99, 100),
              (110, 115, 108, 112),
              (111, 113, 105, 106),
              (104, 106, 97, 99)])       # i=3 에서 처음 100 이하
    assert _find_fill(df, 0, len(df), entry=100.0, window=10) == 3


def test_체결_대기창을_넘기면_안_센다():
    """창 밖에서 닿는 건 «그 플랜으로 산 것»이 아니다."""
    df = _df([(100, 101, 99, 100)] + [(110, 115, 108, 112)] * 5 + [(99, 100, 95, 96)])
    assert _find_fill(df, 0, len(df), entry=100.0, window=3) is None
    # 창을 넓히면 잡힌다
    assert _find_fill(df, 0, len(df), entry=100.0, window=10) == 6


def test_신호_봉_자신은_체결_후보가_아니다():
    """신호는 그 봉 종가로 나온다. 같은 봉에서 사는 건 룩어헤드다."""
    df = _df([(100, 105, 90, 100),       # 신호 봉 저가 90 — 이걸로 체결하면 안 된다
              (110, 115, 108, 112)])
    assert _find_fill(df, 0, len(df), entry=100.0, window=10) is None


@pytest.mark.parametrize("mode", ["signal", "limit", "open"])
def test_세_모드_모두_예외없이_돈다(mode):
    """검출기가 신호를 못 내는 짧은 프레임에서도 죽지 않는다(스모크)."""
    from engine.backtest.event_backtest import backtest_playbook

    df = pd.DataFrame({
        "open": [100.0] * 80, "high": [101.0] * 80,
        "low": [99.0] * 80, "close": [100.0] * 80,
        "volume": [1000.0] * 80,
    })
    out = backtest_playbook(df, "breakout", entry_mode=mode)
    assert isinstance(out, list)
