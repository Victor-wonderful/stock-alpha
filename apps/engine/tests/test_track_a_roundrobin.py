"""트랙 A 후보 선정 — 셋업별 라운드로빈 (2026-08-20).

전역 강도순으로 자르면 셋업이 편식된다. strength 는 셋업 «안에서» 계산된 상대값이라
셋업끼리 비교할 수 없기 때문이다 — markov 는 신호가 나면 무조건 1.000, median·pivot 은
무조건 0.600 을 준다. 실제로 2026-08-20 발행 100건이 세 셋업으로만 채워졌고,
게이트를 통과한 나머지 8조합은 리포트가 0건이었다.
"""
from __future__ import annotations

import pytest

from engine.reports import daily as D


@pytest.fixture
def fake_signals(monkeypatch):
    """signals 조회를 가짜로 — 강도 내림차순으로 이미 정렬된 응답을 흉내낸다."""
    def _install(rows: list[dict], prio: dict[str, float] | None = None):
        # 로더는 «통과 셋업만, 전량» 을 돌려주기로 한 계약이다. 그 계약만 흉내낸다.
        monkeypatch.setattr(
            D, "_load_track_a_signals",
            lambda passed: [r for r in rows if r["setup"] in passed],
        )
        monkeypatch.setattr(D, "setup_priority_from_db", lambda: prio or {})
    return _install


def sig(setup: str, symbol: str, strength: float, style: str = "position") -> dict:
    return {"setup": setup, "style": style, "strength": strength,
            "instruments": {"symbol": symbol, "active": True}}


def test_라운드로빈으로_섞인다(fake_signals):
    rows = ([sig("markov", f"M{i}", 1.0) for i in range(3)]
            + [sig("median", f"D{i}", 0.6) for i in range(3)])
    fake_signals(rows)
    out = D.track_a_symbols({"markov", "median"})
    # 각 셋업의 1등이 먼저, 그 다음 2등 …
    assert out[:2] == ["M0", "D0"] or out[:2] == ["D0", "M0"]
    assert set(out) == {"M0", "M1", "M2", "D0", "D1", "D2"}
    # 상위 3건만 잘라도 두 셋업이 모두 살아남는다(예전엔 markov 가 3건을 다 먹었다)
    assert len({s[0] for s in out[:3]}) == 2


def test_기대값이_높은_셋업이_같은_바퀴에서_앞선다(fake_signals):
    rows = [sig("median", "D0", 0.6), sig("markov", "M0", 1.0)]
    fake_signals(rows, prio={"median": 0.5, "markov": 0.1})
    out = D.track_a_symbols({"markov", "median"})
    assert out[0] == "D0"          # 강도는 낮지만 기대값이 높은 셋업이 먼저


def test_후보가_적은_셋업은_소진되고_큰_셋업이_남은_자리를_채운다(fake_signals):
    rows = [sig("double_bottom", "B0", 0.6)]
    rows += [sig("ensemble", f"E{i}", 0.9) for i in range(4)]
    fake_signals(rows)
    out = D.track_a_symbols({"double_bottom", "ensemble"})
    assert "B0" in out[:2]         # 2건짜리 셋업도 반드시 자리를 얻는다
    assert len(out) == 5


def test_같은_종목이_두_셋업에_있으면_한_번만_넣는다(fake_signals):
    rows = [sig("a", "X", 0.9), sig("b", "X", 0.8), sig("b", "Y", 0.7)]
    fake_signals(rows)
    out = D.track_a_symbols({"a", "b"})
    assert out.count("X") == 1
    assert set(out) == {"X", "Y"}


def test_게이트_미통과_셋업은_제외된다(fake_signals):
    rows = [sig("passed_one", "P", 0.9), sig("failed_one", "F", 1.0)]
    fake_signals(rows)
    out = D.track_a_symbols({"passed_one"})
    assert out == ["P"]


def test_후보가_없으면_빈_목록(fake_signals):
    fake_signals([])
    assert D.track_a_symbols({"anything"}) == []
