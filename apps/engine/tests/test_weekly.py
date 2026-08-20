"""주간 브리핑 제목 규칙.

제목이 «그 주에 실제로 잰 값»에서만 나오는지, 그리고 우선순위가 의도대로인지 고정한다.
전망 표현이 새어 들어가면 이 산출물은 브리핑이 아니라 예측이 된다 — 그것도 막는다.
"""
from __future__ import annotations

import pytest

from engine.reports.weekly import build_headline

# 전망으로 읽히는 말들. 하나라도 제목·요약에 들어가면 안 된다.
FORWARD_LOOKING = ("전망", "예상", "예측", "будет", "오를 것", "내릴 것", "반등", "기대됩니다")


def ctx(**kw) -> dict:
    base = {
        "week_start": "2026-08-17",
        "week_end": "2026-08-21",
        "sessions": [],
        "market_ret": None,
        "flows": {},
        "macro": {},
        "picks_issued": 0,
    }
    base.update(kw)
    return base


def test_수급_연속이_최우선이다():
    """시장이 크게 움직인 주여도, 수급 연속이 있으면 그게 제목이 된다."""
    title, _ = build_headline(
        ctx(
            market_ret=-0.05,
            flows={"foreign_streak": 3, "foreign_dir": "순매도"},
        )
    )
    assert title == "외국인이 3주째 순매도 중입니다"


def test_연속_1주는_제목이_아니다():
    """한 주 판 것은 «연속»이 아니다 — 다음 규칙(시장 수익률)으로 넘어가야 한다."""
    title, _ = build_headline(
        ctx(market_ret=-0.05, flows={"foreign_streak": 1, "foreign_dir": "순매도"})
    )
    assert "주째" not in title
    assert "-5.0%" in title


def test_시장이_문턱_미만이면_제목이_되지_않는다():
    """±2% 미만은 그 주의 «특징»이라 부를 수 없다."""
    title, _ = build_headline(ctx(market_ret=0.005))
    assert "0.5%" not in title


def test_공포지수_급변은_제목이_된다():
    title, _ = build_headline(ctx(macro={"vix": {"change_pct": 0.31}}))
    assert "공포지수" in title and "+31.0%" in title


def test_브레드스_과반_전환():
    title, _ = build_headline(
        ctx(sessions=[{"breadth": 0.41}, {"breadth": 0.58}])
    )
    assert title == "오른 종목이 주중에 과반으로 돌아섰습니다"


def test_아무것도_두드러지지_않으면_그_사실을_말한다():
    title, _ = build_headline(ctx(market_ret=0.001))
    assert title == "특별히 달라진 것이 없는 한 주였습니다"


def test_제목으로_쓴_사실은_설명에서_빠진다():
    """같은 숫자를 제목과 설명에서 두 번 말하면 둘 다 신뢰를 잃는다."""
    title, summary = build_headline(ctx(market_ret=-0.034, picks_issued=10))
    assert "-3.4%" in title
    assert "시장은 한 주 동안" not in summary
    assert "추천은 10건" in summary


@pytest.mark.parametrize(
    "c",
    [
        ctx(market_ret=-0.05, flows={"foreign_streak": 3, "foreign_dir": "순매도"}),
        ctx(market_ret=0.042, picks_issued=7),
        ctx(macro={"vix": {"change_pct": -0.22}}),
        ctx(sessions=[{"breadth": 0.62}, {"breadth": 0.33}]),
        ctx(sessions=[{"regime": "risk_on"}, {"regime": "risk_off"}]),
        ctx(),
    ],
)
def test_전망_표현이_없다(c):
    title, summary = build_headline(c)
    for word in FORWARD_LOOKING:
        assert word not in title, f"제목에 전망 표현: {word}"
        assert word not in summary, f"설명에 전망 표현: {word}"
