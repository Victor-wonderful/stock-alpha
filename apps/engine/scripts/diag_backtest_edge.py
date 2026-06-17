"""진단: 게이트가 저장한 backtests 행을 strategy_key×style 별 최신값으로 출력.

live 픽 표본이 작으므로(7건) 엣지 판정은 대량표본 백테스트로 한다.
expectancy_r > 0 이고 passed=True 면 (나)엣지부재 아님 → 문제는 레벨/판정/표본.

실행: (apps/engine 에서) python -m scripts.diag_backtest_edge
"""
from __future__ import annotations

from engine.db import select_all


def main() -> None:
    rows = select_all(
        "backtests",
        "strategy_key,style,expectancy_r,win_rate,avg_rr,mdd,sharpe,passed,passed_raw,period,created_at",
    )
    if not rows:
        print("backtests 행 없음.")
        return

    # strategy_key×style 별 최신 1건
    latest: dict[tuple, dict] = {}
    for r in rows:
        k = (r.get("strategy_key"), r.get("style"))
        cur = latest.get(k)
        if cur is None or str(r.get("created_at")) > str(cur.get("created_at")):
            latest[k] = r

    hdr = (
        f"{'strategy_key':22} {'style':9} {'exp_R':>7} {'win%':>6} "
        f"{'avg_rr':>7} {'mdd':>7} {'sharpe':>7} {'pass':>5} {'period'}"
    )
    print(f"백테스트 행: {len(rows)}  (strategy×style 최신만 표시)\n")
    print(hdr)
    print("-" * len(hdr))

    def num(x, f="{:.3f}"):
        return f.format(float(x)) if x is not None else "  -"

    for k in sorted(latest, key=lambda t: (str(t[0]), str(t[1]))):
        r = latest[k]
        wr = (float(r["win_rate"]) * 100) if r.get("win_rate") is not None else None
        print(
            f"{str(r.get('strategy_key')):22} {str(r.get('style') or '-'):9} "
            f"{num(r.get('expectancy_r')):>7} "
            f"{(f'{wr:.1f}' if wr is not None else '-'):>6} "
            f"{num(r.get('avg_rr')):>7} {num(r.get('mdd')):>7} "
            f"{num(r.get('sharpe')):>7} {str(r.get('passed')):>5} "
            f"{r.get('period')}"
        )


if __name__ == "__main__":
    main()
