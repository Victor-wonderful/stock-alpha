"""진단: 발행된 daily_focus 픽의 실제 트랙레코드를 집계한다.

목적 — "손절이 너무 많다"의 원인이
  (가) 손절선이 진입가에 붙어 노이즈에 털린다  → 손절폭 분포가 타이트
  (나) 시그널 자체에 엣지가 없다              → 기대값(net return)이 음수
중 어느 쪽인지 데이터로 가른다.

집계 단위: setup × style, 그리고 전체.
지표: status별 비율 / 손절폭·목표폭 비율 분포 / 종료픽 기대값·승률.

실행: (apps/engine 에서) python -m scripts.diag_pick_track
"""
from __future__ import annotations

import statistics as st
from collections import defaultdict

from engine.db import select_all

CLOSED = ("target", "stopped", "expired")


def _ratio(num: float, den: float) -> float:
    return (num / den) if den else 0.0


def _pct(xs: list[float]) -> str:
    """리스트의 중앙값·사분위를 % 문자열로."""
    if not xs:
        return "    n/a"
    xs = sorted(xs)
    q1 = xs[len(xs) // 4]
    med = xs[len(xs) // 2]
    q3 = xs[(len(xs) * 3) // 4]
    return f"{q1*100:5.1f} {med*100:5.1f} {q3*100:5.1f}"


def main() -> None:
    rows = select_all(
        "recommendations",
        "setup,style,status,entry_price,stop_loss,target_price,close_return_pct,as_of,closed_at",
        eq={"basket_type": "daily_focus"},
    )
    if not rows:
        print("daily_focus 픽 없음 — 발행 이력이 없습니다.")
        return

    # 그룹: (setup, style) → 행들
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r.get("setup") or "?", r.get("style") or "?")].append(r)
    groups[("__ALL__", "")] = rows  # 전체 합산

    print(f"총 발행 픽: {len(rows)}\n")
    hdr = (
        f"{'setup':18} {'style':9} {'n':>4} {'open':>5} "
        f"{'tgt%':>6} {'stop%':>6} {'exp%':>6} "
        f"{'손절폭 q1/med/q3':>18} {'목표폭 q1/med/q3':>18} "
        f"{'승률':>6} {'기대값%':>8}"
    )
    print(hdr)
    print("-" * len(hdr))

    def emit(key: tuple[str, str], rs: list[dict]) -> None:
        setup, style = key
        n = len(rs)
        n_open = sum(1 for r in rs if r["status"] == "open")
        n_tgt = sum(1 for r in rs if r["status"] == "target")
        n_stop = sum(1 for r in rs if r["status"] == "stopped")
        n_exp = sum(1 for r in rs if r["status"] == "expired")
        n_closed = n_tgt + n_stop + n_exp

        stop_dist, tgt_dist = [], []
        for r in rs:
            e = r.get("entry_price")
            if not e:
                continue
            e = float(e)
            if r.get("stop_loss") is not None:
                stop_dist.append(abs(e - float(r["stop_loss"])) / e)
            if r.get("target_price") is not None:
                tgt_dist.append(abs(float(r["target_price"]) - e) / e)

        # 종료픽 기준 기대값·승률 (close_return_pct = 청산수익률)
        closed_ret = [
            float(r["close_return_pct"])
            for r in rs
            if r["status"] in CLOSED and r.get("close_return_pct") is not None
        ]
        win = _ratio(sum(1 for x in closed_ret if x > 0), len(closed_ret))
        exp = st.mean(closed_ret) if closed_ret else 0.0

        print(
            f"{setup:18} {style:9} {n:>4} {n_open:>5} "
            f"{_ratio(n_tgt, n_closed)*100:5.1f}% {_ratio(n_stop, n_closed)*100:5.1f}% "
            f"{_ratio(n_exp, n_closed)*100:5.1f}% "
            f"{_pct(stop_dist):>18} {_pct(tgt_dist):>18} "
            f"{win*100:5.1f}% {exp*100:7.2f}%"
        )

    # setup/style 그룹 먼저, 전체는 마지막
    for key in sorted(k for k in groups if k[0] != "__ALL__"):
        emit(key, groups[key])
    print("-" * len(hdr))
    emit(("__ALL__", ""), groups[("__ALL__", "")])

    print(
        "\n해석:\n"
        " · stop% 높고 손절폭 med 가 작다(예: <2%) → (가) 손절선이 타이트. levels 클램프 수정으로 회복 가능.\n"
        " · 손절폭은 정상인데 기대값이 음수 → (나) 엣지 부재. 해당 setup 발행 중단 검토.\n"
        " · 승률·기대값은 '종료된 픽'만 대상(open 제외). open 비중 크면 표본 부족 주의."
    )


if __name__ == "__main__":
    main()
