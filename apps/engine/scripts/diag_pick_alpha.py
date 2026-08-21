"""진단: 우리가 «고른 종목»에 알파가 있나, 아니면 «파는 방식»이 죽이나.

Victor 질문(2026-08-21): "상승 종목이 많은데 왜 좋은 종목을 못 고르나."
그 전에 갈라야 할 게 있다 — 성적이 나쁜 이유가

  (가) 종목 선택이 나쁘다      → 픽 종목의 «손절 없는» 수익률이 시장 평균 이하
  (나) 청산(손절)이 죽인다      → 손절 없는 수익률은 시장보다 높은데 실현 손익만 음수

둘은 처방이 정반대다. (가)면 셋업·팩터를 갈아야 하고, (나)면 손절폭·목표를 고쳐야
한다. 짐작으로 새 방법을 얹으면 멀쩡한 쪽을 뜯게 된다.

측정 방법 — 발행된 픽 전량에 대해:
  · 진입   = 발행일 다음 거래일 «시가» (2026-08-21 전환한 실제 진입 방식)
  · 경로   = 이후 N거래일의 고가/저가/종가
  · MAE    = 최대 역행폭 (진입 대비 최저) — 손절이 어디서 맞았는지 설명
  · MFE    = 최대 순행폭 (진입 대비 최고) — "먹을 게 있었나"
  · 무손절 = N일 뒤 종가 수익률 (손절·목표 없이 그냥 들고 있었다면)
  · 기준선 = 같은 진입일·같은 N일, 유동성 통과 전 종목의 평균 수익률
             ("그날 아무거나 샀으면" — 상승장이면 이 값이 양수다)

기준선을 반드시 함께 본다. 픽 수익률이 +3% 라도 그날 시장이 +5% 였으면 진 것이고,
-2% 라도 시장이 -6% 였으면 이긴 것이다. 절대 수익률만 보면 시장 방향을 실력으로
착각한다([[stock-alpha-market-brief]] 의 기준선 55.3% 와 같은 논지).

실행: (apps/engine 에서) python -m scripts.diag_pick_alpha
      python -m scripts.diag_pick_alpha --horizons 5,10,20
"""
from __future__ import annotations

import argparse
import statistics as st
from collections import defaultdict

import pandas as pd

from engine.db import get_client
from engine.logging import get_logger

log = get_logger(__name__)

BASKET = "daily_focus"


def _pct(v: float | None) -> str:
    return "—" if v is None else f"{v * 100:+6.2f}%"


def _load_frames() -> dict[int, pd.DataFrame]:
    """유동성 통과 전 종목 일봉 — 백테스트·시그널과 같은 모집단."""
    from engine import db_direct
    from engine.liquidity import filter_liquid_frames

    frames = db_direct.load_all_ohlcv_1d(bars=500)
    return filter_liquid_frames(frames)


def _forward(df: pd.DataFrame, as_of: str, horizons: list[int]) -> dict | None:
    """발행일 다음 봉 시가 진입 → 지평선별 경로 통계. 봉이 모자라면 None."""
    if "ts" not in df.columns:
        return None
    ts = df["ts"].astype(str).str[:10]
    after = df[ts > as_of]
    if after.empty:
        return None
    entry = float(after["open"].iloc[0])
    if entry <= 0:
        return None
    out: dict = {"entry": entry, "bars": len(after)}
    for h in horizons:
        win = after.iloc[:h]
        if len(win) < h:                       # 아직 h일이 안 지난 픽은 그 지평선 제외
            continue
        out[h] = {
            "ret": float(win["close"].iloc[-1]) / entry - 1,
            "mae": float(win["low"].min()) / entry - 1,
            "mfe": float(win["high"].max()) / entry - 1,
        }
    return out


def _baseline(frames: dict[int, pd.DataFrame], as_of: str, h: int) -> float | None:
    """그날 «아무거나» 샀으면 — 전 종목 h일 수익률 중앙값(진입도 다음 시가)."""
    rets: list[float] = []
    for df in frames.values():
        fw = _forward(df, as_of, [h])
        if fw and h in fw:
            rets.append(fw[h]["ret"])
    return st.median(rets) if len(rets) >= 30 else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizons", default="5,10,20",
                    help="측정할 보유 거래일 (쉼표 구분)")
    args = ap.parse_args()
    horizons = [int(x) for x in args.horizons.split(",") if x.strip()]

    picks = (
        get_client().table("recommendations")
        .select("as_of,setup,style,instrument_id,status,close_return_pct,"
                "entry_price,stop_loss,target_price")
        .eq("basket_type", BASKET).order("as_of").execute()
    ).data or []
    print(f"발행 픽 {len(picks)}건 · 지평선 {horizons} 거래일\n")

    frames = _load_frames()
    print(f"유동성 통과 종목 {len(frames)}개 (기준선 모집단)\n")

    # 기준선은 발행일마다 한 번만 계산(무거움) → 캐시
    base_cache: dict[tuple[str, int], float | None] = {}

    rows: list[dict] = []
    for p in picks:
        df = frames.get(p["instrument_id"])
        if df is None or df.empty:
            continue
        fw = _forward(df, str(p["as_of"]), horizons)
        if fw is None:
            continue
        rows.append({"pick": p, "fw": fw})

    print(f"경로 측정 가능 {len(rows)}건\n")
    if not rows:
        return

    # ── 지평선별: 픽 무손절 수익률 vs 그날 시장 기준선 ──
    print("═══ ① 손절 없이 그냥 들고 있었다면 (픽 vs 그날 시장) ═══\n")
    print(f"{'보유':>4} {'표본':>4} {'픽 중앙값':>10} {'시장 중앙값':>11} "
          f"{'초과':>9} {'픽>시장':>8}")
    for h in horizons:
        pairs: list[tuple[float, float]] = []
        for r in rows:
            if h not in r["fw"]:
                continue
            key = (str(r["pick"]["as_of"]), h)
            if key not in base_cache:
                base_cache[key] = _baseline(frames, key[0], h)
            b = base_cache[key]
            if b is None:
                continue
            pairs.append((r["fw"][h]["ret"], b))
        if not pairs:
            print(f"{h:>4}일 {'표본 부족':>40}")
            continue
        pr = st.median([a for a, _ in pairs])
        br = st.median([b for _, b in pairs])
        winf = sum(1 for a, b in pairs if a > b) / len(pairs)
        print(f"{h:>4}일 {len(pairs):>4} {_pct(pr):>10} {_pct(br):>11} "
              f"{_pct(pr - br):>9} {winf * 100:>7.1f}%")

    # ── 손절이 어디서 맞았나 — MAE 분포 ──
    print("\n═══ ② 최대 역행(MAE)·최대 순행(MFE) — 손절폭이 적정한가 ═══\n")
    print(f"{'보유':>4} {'표본':>4} {'MAE 중앙':>10} {'MFE 중앙':>10} "
          f"{'MFE>0 비율':>11}")
    for h in horizons:
        sub = [r["fw"][h] for r in rows if h in r["fw"]]
        if not sub:
            continue
        print(f"{h:>4}일 {len(sub):>4} "
              f"{_pct(st.median([x['mae'] for x in sub])):>10} "
              f"{_pct(st.median([x['mfe'] for x in sub])):>10} "
              f"{sum(1 for x in sub if x['mfe'] > 0) / len(sub) * 100:>10.1f}%")

    # ── 설계한 손절폭이 MAE 분포의 어디에 있나 ──
    print("\n═══ ③ 설계 손절폭 vs 실제 역행 — 노이즈에 털렸나 ═══\n")
    stops: list[float] = []
    hit_then_recover = 0
    n_with_stop = 0
    H = max(horizons)
    for r in rows:
        p, fw = r["pick"], r["fw"]
        e, s_ = p.get("entry_price"), p.get("stop_loss")
        if not e or not s_ or H not in fw:
            continue
        width = 1 - float(s_) / float(e)          # 진입 대비 손절폭(설계)
        stops.append(width)
        n_with_stop += 1
        # 손절폭만큼 역행했다가, 그 뒤 목표폭 이상 순행한 픽 = "털리고 갔다"
        tgt = p.get("target_price")
        up = (float(tgt) / float(e) - 1) if tgt else None
        if fw[H]["mae"] <= -width and up is not None and fw[H]["mfe"] >= up:
            hit_then_recover += 1
    if stops:
        print(f"설계 손절폭 중앙값 {st.median(stops) * 100:.2f}% "
              f"(표본 {len(stops)}건)")
        print(f"손절 맞은 뒤 목표까지 간 픽: {hit_then_recover}/{n_with_stop} "
              f"({hit_then_recover / n_with_stop * 100:.1f}%) — "
              f"높을수록 손절이 노이즈에 털린 것")

    # ── 셋업별 초과수익 ──
    print("\n═══ ④ 셋업별 초과수익(무손절, 최장 지평선) ═══\n")
    by_setup: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        if H not in r["fw"]:
            continue
        key = (str(r["pick"]["as_of"]), H)
        if key not in base_cache:
            base_cache[key] = _baseline(frames, key[0], H)
        b = base_cache[key]
        if b is None:
            continue
        by_setup[str(r["pick"].get("setup"))].append(r["fw"][H]["ret"] - b)
    for k, v in sorted(by_setup.items(), key=lambda kv: -st.median(kv[1])):
        print(f"  {k:22} n={len(v):>3}  초과 중앙값 {_pct(st.median(v))}")


if __name__ == "__main__":
    main()
