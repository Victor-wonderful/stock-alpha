"""칼만·시그마 신규 셋업 엣지 검증 — 유동 상위 샘플로 백테스트 + 게이트 평가.

DB 미기록. baseline(leader_trend·oversold_bounce)과 같은 조건으로 비교한다.
"""
from __future__ import annotations
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from engine import db_direct
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GateThresholds, evaluate_gate
from engine.signals.playbooks import ALLOWED_STYLES, DAILY_TESTABLE_STYLES

SAMPLE = 400          # 유동 상위 N종목
BARS = 320            # 종목당 일봉 수
SETUPS = ["sigma", "kalman", "leader_trend", "oversold_bounce"]

print(f"OHLCV 로드 (bars={BARS}) ...", flush=True)
frames = db_direct.load_all_ohlcv_1d(bars=BARS)

# 유동 상위 — 최근 20봉 평균 거래대금(close*volume).
liq = []
for iid, df in frames.items():
    if len(df) < 150:
        continue
    tail = df.tail(20)
    val = float((tail["close"] * tail["volume"]).mean())
    liq.append((val, iid))
liq.sort(reverse=True)
sample = [iid for _, iid in liq[:SAMPLE]]
print(f"샘플 {len(sample)}종목 (≥150봉, 거래대금 상위)\n", flush=True)

thr = GateThresholds()
print(f"{'셋업':<16}{'스타일':<10}{'표본':>6}{'승률':>7}{'평균R:R':>8}{'기대값R':>9}{'MDD':>7}  판정")
print("-" * 78)
for setup in SETUPS:
    styles = [s for s in ALLOWED_STYLES.get(setup, ()) if s in DAILY_TESTABLE_STYLES]
    for style in styles:
        trades = []
        for iid in sample:
            df = frames[iid]
            trades += backtest_playbook(
                df, setup, style_override=style, scaleout=True,
            )
        gr = evaluate_gate(trades, thr)
        wr = f"{gr.win_rate*100:.0f}%" if gr.win_rate is not None else "—"
        rr = f"{gr.avg_rr:.2f}" if gr.avg_rr is not None else "—"
        ex = f"{gr.expectancy_r:+.3f}" if gr.expectancy_r is not None else "—"
        md = f"{gr.mdd*100:.0f}%" if gr.mdd is not None else "—"
        verdict = "✅ PASS" if gr.passed else "❌ " + (", ".join(gr.reasons)[:38] or "fail")
        print(f"{setup:<16}{style:<10}{gr.n_trades:>6}{wr:>7}{rr:>8}{ex:>9}{md:>7}  {verdict}")
print("\n완료. (sigma/kalman 이 baseline 대비 기대값R·PASS 어떤지 비교)")
