"""진단: 추세강도 ER 의 실제 분포 — 경계 0.40 이 맞는 값인지 잰다.

왜 필요한가 (2026-08-22) —
  `regime.ER_TREND = 0.40` 은 측정에서 나온 값이 아니다. 실측 avg_er 은 0.15~0.18
  이라 경계를 한 번도 넘지 못하고, 그래서 4국면 중 «transition» 이 429일 복원에서
  0일이었다. 즉 추세강도 축이 아무 일도 하지 않는다 — 국면은 방향 점수 하나로만
  갈린다(2축 설계인데 실제로는 1축).

  원인 가설: 재료와 경계가 다른 것을 재고 있다. 지금 avg_er 은 «종목별 ER 의 평균»
  인데 개별 종목은 대부분 갈지자라 0.15~0.2 가 정상이다. 0.40 은 «지수 한 줄의 ER»
  을 상정한 값으로 보인다(지수는 종목 노이즈가 상쇄돼 훨씬 높다).

이 스크립트는 결론을 내지 않고 **분포만** 낸다. 경계는 그걸 보고 사람이 정한다.
  · 종목평균 ER 의 날짜별 분포(백분위·히스토그램)
  · 같은 날의 «지수 ER»(동일가중 지수 한 줄) — 대안 A 의 재료
  · 후보 경계별로 4국면 분포가 어떻게 갈리는지

실행 (apps/engine 에서):
    python -m scripts.diag_er_distribution
    python -m scripts.diag_er_distribution --bars 500
"""
from __future__ import annotations

import argparse
import statistics as st
from collections import Counter, defaultdict

import numpy as np
import pandas as pd

from engine.backtest.runner import _load_active_frames
from engine.liquidity import filter_liquid_frames
from engine.logging import get_logger
from engine.market.regime import compute_regime

log = get_logger(__name__)

N = 20  # ER 창

# 옛 경계 — 2026-08-22 에 regime 에서 제거됐다. 이 스크립트는 «왜 제거했나» 의
# 근거라서 값을 여기 남겨 두고 비교 기준으로만 쓴다.
ER_TREND = 0.40


def er_series(close: np.ndarray, n: int = N) -> np.ndarray:
    """효율성비율 시계열(벡터화). regime.efficiency_ratio 와 같은 정의.

    net_i = |c[i] - c[i-n]| · path_i = Σ|일별변동| (i-n+1 … i)
    앞의 n 개는 NaN.
    """
    out = np.full(len(close), np.nan)
    if len(close) <= n:
        return out
    diffs = np.abs(np.diff(close))                       # len-1
    csum = np.concatenate([[0.0], np.cumsum(diffs)])     # len
    net = np.abs(close[n:] - close[:-n])
    path = csum[n:] - csum[:-n]
    with np.errstate(divide="ignore", invalid="ignore"):
        out[n:] = np.where(path > 0, net / path, 0.0)
    return out


def pctile(xs: list[float], q: float) -> float:
    return float(np.percentile(xs, q)) if xs else float("nan")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bars", type=int, default=500)
    args = ap.parse_args()

    frames = filter_liquid_frames(_load_active_frames(bars=args.bars))
    log.info("diag.universe", liquid=len(frames))

    # ── 날짜별로 (종목 ER 들, 20일 수익률들, 정규화 종가들) 을 모은다 ──
    ers: dict[str, list[float]] = defaultdict(list)
    rets: dict[str, list[float]] = defaultdict(list)
    norm: dict[str, list[float]] = defaultdict(list)   # 동일가중 지수용
    for df in frames.values():
        if "ts" not in df.columns or len(df) < N + 25:
            continue
        ts = df["ts"].astype(str).str[:10].tolist()
        cl = df["close"].astype(float).to_numpy()
        e = er_series(cl)
        base = cl[0] if cl[0] > 0 else None
        for i in range(N, len(cl)):
            if not np.isnan(e[i]):
                ers[ts[i]].append(float(e[i]))
            if cl[i - N] > 0:
                rets[ts[i]].append(cl[i] / cl[i - N] - 1)
            if base:
                norm[ts[i]].append(cl[i] / base)

    dates = sorted(d for d in ers if len(rets.get(d, [])) >= 30)
    if not dates:
        print("데이터 부족")
        return

    avg_er = {d: sum(ers[d]) / len(ers[d]) for d in dates}

    # 동일가중 지수 한 줄 → 그 시계열의 ER (대안 A 의 재료)
    idx = np.array([sum(norm[d]) / len(norm[d]) for d in dates])
    idx_er_arr = er_series(idx)
    idx_er = {d: float(idx_er_arr[i]) for i, d in enumerate(dates)
              if not np.isnan(idx_er_arr[i])}

    # 방향 점수 — 국면 분포를 다시 그리려면 필요(수급은 제외: 분포 비교엔 영향 미미)
    score = {d: compute_regime(rets[d], None)["score"] for d in dates}

    vals = [avg_er[d] for d in dates]
    ivals = [idx_er[d] for d in dates if d in idx_er]

    print(f"\n대상 {len(dates)}거래일 · 종목 {len(frames)}개 · ER 창 {N}일")
    print(f"현재 경계 ER_TREND = {ER_TREND}\n")

    print("=" * 72)
    print("① 종목평균 ER (지금 쓰는 재료) 의 백분위")
    print("=" * 72)
    for q in (5, 10, 25, 50, 70, 75, 80, 90, 95, 99, 100):
        print(f"  p{q:<3} {pctile(vals, q):.3f}")
    print(f"  평균 {st.mean(vals):.3f} · 최소 {min(vals):.3f} · 최대 {max(vals):.3f}")
    over = sum(1 for v in vals if v >= ER_TREND)
    print(f"  → 현재 경계 {ER_TREND} 이상인 날: {over}일 ({over/len(vals):.1%})")

    print("\n" + "=" * 72)
    print("② 히스토그램 — 종목평균 ER")
    print("=" * 72)
    lo, hi = min(vals), max(vals)
    nb = 20
    width = (hi - lo) / nb if hi > lo else 1.0
    hist = Counter(min(nb - 1, int((v - lo) / width)) for v in vals)
    top = max(hist.values())
    for b in range(nb):
        c = hist.get(b, 0)
        bar = "█" * int(round(c / top * 46))
        mark = "  ← 현재 경계" if lo + b * width <= ER_TREND < lo + (b + 1) * width else ""
        print(f"  {lo + b*width:.3f} {bar:<46} {c:>4}{mark}")

    print("\n" + "=" * 72)
    print("③ 지수 ER (동일가중 지수 한 줄 — 대안 A 의 재료)")
    print("=" * 72)
    if ivals:
        for q in (5, 25, 50, 75, 95):
            print(f"  p{q:<3} {pctile(ivals, q):.3f}")
        print(f"  평균 {st.mean(ivals):.3f} · 최소 {min(ivals):.3f} · 최대 {max(ivals):.3f}")
        iover = sum(1 for v in ivals if v >= ER_TREND)
        print(f"  → 경계 {ER_TREND} 이상인 날: {iover}일 ({iover/len(ivals):.1%})")
    else:
        print("  계산 불가")

    print("\n" + "=" * 72)
    print("④ 후보 경계별 4국면 분포 (방향 점수 ±0.2 는 그대로)")
    print("=" * 72)
    # (재료, 경계) 쌍 — 종목평균 ER 은 경계만 바꿔보고, 지수 ER 은 대안 A 다.
    cands = [("종목평균 0.40", "avg", ER_TREND),
             ("종목평균 p70", "avg", pctile(vals, 70)),
             ("종목평균 p80", "avg", pctile(vals, 80)),
             ("지수 0.40", "idx", ER_TREND),
             ("지수 p50", "idx", pctile(ivals, 50) if ivals else float("nan")),
             ("지수 p75", "idx", pctile(ivals, 75) if ivals else float("nan"))]
    print(f"  {'재료·경계':<16}{'값':>7}{'상승':>8}{'하락':>8}{'횡보':>8}{'전환':>8}")
    for name, src, thr in cands:
        c = Counter()
        skipped = 0
        for d in dates:
            sc = score[d]
            if sc > 0.2:
                c["상승"] += 1
            elif sc < -0.2:
                c["하락"] += 1
            else:
                e = avg_er[d] if src == "avg" else idx_er.get(d)
                if e is None:
                    skipped += 1          # 지수 ER 미산출 초기 20일
                elif e >= thr:
                    c["전환"] += 1
                else:
                    c["횡보"] += 1
        note = f"  (ER 미상 {skipped})" if skipped else ""
        print(f"  {name:<16}{thr:>7.3f}{c['상승']:>8}{c['하락']:>8}"
              f"{c['횡보']:>8}{c['전환']:>8}{note}")

    print("\n⚠️ 이 표는 «국면이 어떻게 갈리는가»만 보여준다. 어느 경계가 «돈이 되는가»는")
    print("   diag_regime_expectancy 로 국면별 기대값을 다시 재야 알 수 있다.")


if __name__ == "__main__":
    main()
