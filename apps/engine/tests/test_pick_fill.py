"""픽 판정의 진입 체결 확인 (2026-08-20).

픽은 전일 종가를 진입가로 적어 발행된다. 다음 날 그 가격 «이하로 내려와야» 살 수 있다.
예전에는 이 확인 없이 목표만 찍으면 승리로 셌고, 그래서 아무도 못 산 승리가
성적표에 올랐다(실측 48건: 목표 픽 3건 중 2건이 진입 미체결).

여기서 고정하는 것: 진입가에 안 닿은 픽은 이겨도 «거래가 아니다».
"""
from __future__ import annotations

from datetime import date

from engine.reports.daily import resolve_pick_status

TODAY = date(2026, 8, 20)


def pick(**kw) -> dict:
    base = {
        "as_of": "2026-08-10",
        "entry_price": 100.0,
        "target_price": 120.0,
        "tp2_price": None,      # 옛 픽 형태 = 단일 청산 경로
        "stop_loss": 90.0,
        "style": "swing",       # 타임아웃 10봉
        "tp1_hit": False,
    }
    base.update(kw)
    return base


def bar(low: float, high: float, close: float) -> dict:
    return {"low": low, "high": high, "close": close}


def test_진입가에_안_닿고_목표만_찍으면_미체결이다():
    """갭업해서 도망간 종목 — 목표를 넘겨도 살 수가 없었다."""
    bars = [bar(105, 125, 124)] + [bar(120, 130, 125)] * 12
    out = resolve_pick_status(pick(), bars, TODAY)
    assert out is not None
    assert out["status"] == "unfilled"
    # 거래가 없었으므로 손익도 없다
    assert out["close_return_pct"] is None


def test_진입가에_닿은_뒤_목표를_찍으면_승리다():
    bars = [bar(98, 105, 104), bar(100, 125, 124)]
    out = resolve_pick_status(pick(), bars, TODAY)
    assert out is not None
    assert out["status"] == "target"


def test_진입가에_닿은_뒤_손절이면_손절이다():
    bars = [bar(99, 102, 100), bar(88, 99, 89)]
    out = resolve_pick_status(pick(), bars, TODAY)
    assert out is not None
    assert out["status"] == "stopped"


def test_같은_봉에서_체결과_손절이_동시면_손절로_본다():
    """저가가 진입가와 손절가를 함께 통과한 봉 — 보수적으로 손절 처리.

    (손절가 < 진입가 이므로 저가가 손절가 아래면 진입가도 지난 것이다)
    """
    bars = [bar(85, 101, 86)]
    out = resolve_pick_status(pick(), bars, TODAY)
    assert out is not None
    assert out["status"] == "stopped"


def test_체결_대기중이면_아직_닫지_않는다():
    """타임아웃 전이고 아직 안 닿았으면 판정 보류(None) — 열린 채로 둔다."""
    bars = [bar(105, 110, 108)] * 3
    assert resolve_pick_status(pick(), bars, TODAY) is None


def test_타임아웃까지_안_닿으면_미체결로_닫는다():
    bars = [bar(105, 110, 108)] * 10          # swing 타임아웃 = 10봉
    out = resolve_pick_status(pick(), bars, TODAY)
    assert out is not None
    assert out["status"] == "unfilled"


def test_진입가가_없는_옛_픽은_예전대로_판정한다():
    """체결 여부를 물을 수 없는 픽까지 미체결로 밀어내지 않는다."""
    bars = [bar(88, 95, 89)]
    out = resolve_pick_status(pick(entry_price=None), bars, TODAY)
    assert out is not None
    assert out["status"] == "stopped"


def test_분할익절_픽도_체결을_먼저_본다():
    """tp2 가 있는 현행 픽(스케일아웃 경로)도 같은 규칙이다."""
    bars = [bar(105, 125, 124)] * 12
    out = resolve_pick_status(pick(tp2_price=140.0), bars, TODAY)
    assert out is not None
    assert out["status"] == "unfilled"


def test_이미_1차익절한_픽은_체결된_것으로_본다():
    """진입 없이 익절될 수는 없다 — tp1_hit 이면 과거에 체결된 픽이다."""
    bars = [bar(99, 105, 100)]
    out = resolve_pick_status(pick(tp2_price=140.0, tp1_hit=True), bars, TODAY)
    # 본전(=진입가) 청산 → partial
    assert out is not None
    assert out["status"] == "partial"
