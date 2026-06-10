"""시장 레짐(위험선호/회피) 산출 — 자체 데이터(모멘텀·브레드스·수급)만 사용.

어제(2026-06-09) 애드혹으로 적재된 regime-v1 의 동인을 재현·정식화:
  · 시장 20일 모멘텀 — 유동 유니버스 동일가중 평균 수익률
  · 브레드스 — 20일 양(+)수익 종목 비중
  · 외국인 수급 — 최근 5일 순매수 방향(flows 보유 종목 합)
점수 -1(위험회피)~+1(위험선호) → risk_off(<-0.2) / neutral / risk_on(>0.2).
"""
from __future__ import annotations

from datetime import date

import pandas as pd

from engine.db import get_client, select_all, upsert
from engine.liquidity import filter_liquid_frames
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "regime-v2"


def compute_regime(
    returns_20d: list[float], foreign_net_5d: float | None
) -> dict:
    """레짐 점수·동인 산출 (순수 함수).

    returns_20d: 종목별 20일 수익률 단면.
    foreign_net_5d: 최근 5일 외국인 순매수 합(KRW). None 이면 수급 축 제외.
    """
    drivers: list[str] = []
    parts: list[float] = []

    if returns_20d:
        mom = sum(returns_20d) / len(returns_20d)
        # ±10% 를 ±1 로 스케일
        parts.append(max(-1.0, min(1.0, mom / 0.10)))
        drivers.append(f"시장 20일 {mom:+.1%}")

        breadth = sum(1 for r in returns_20d if r > 0) / len(returns_20d)
        # 50% 중립, 20%p 편차를 ±1 로
        parts.append(max(-1.0, min(1.0, (breadth - 0.5) / 0.2)))
        drivers.append(f"상승종목 비중 {breadth:.0%}")

    if foreign_net_5d is not None:
        sign = 1.0 if foreign_net_5d > 0 else -1.0 if foreign_net_5d < 0 else 0.0
        parts.append(sign * 0.5)  # 방향만 절반 가중
        drivers.append(f"외국인 5일 순{'매수' if foreign_net_5d >= 0 else '매도'}")

    score = round(sum(parts) / len(parts), 4) if parts else 0.0
    regime = "risk_on" if score > 0.2 else "risk_off" if score < -0.2 else "neutral"
    return {"regime": regime, "score": score, "drivers": drivers}


def _load_closes(iid: int, limit: int = 25) -> pd.DataFrame:
    res = (
        get_client().table("ohlcv").select("ts,close,volume")
        .eq("instrument_id", iid).eq("interval", "1d")
        .order("ts", desc=True).limit(limit).execute()
    )
    rows = list(reversed(res.data or []))
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    return df.assign(close=df["close"].astype(float), volume=df["volume"].astype(float))


def run(frames: dict[int, pd.DataFrame] | None = None) -> dict:
    """레짐 산출·적재. frames 를 받으면(일일 배치 재사용) 재조회 생략."""
    if frames is None:
        inst = select_all("instruments", "id", eq={"active": True})
        frames = {it["id"]: _load_closes(it["id"]) for it in inst}
        frames = {k: v for k, v in frames.items() if len(v) >= 21}
        frames = filter_liquid_frames(frames)

    rets = [
        float(df["close"].iloc[-1] / df["close"].iloc[-21] - 1)
        for df in frames.values()
        if len(df) >= 21
    ]

    # 외국인 5일 순매수 — flows 최신 5영업일 합 (적재된 종목 한정)
    fn: float | None = None
    flows = (
        get_client().table("flows").select("date,foreign_net")
        .order("date", desc=True).limit(2000).execute()
    ).data or []
    if flows:
        days = sorted({r["date"] for r in flows}, reverse=True)[:5]
        vals = [float(r["foreign_net"]) for r in flows
                if r["date"] in days and r.get("foreign_net") is not None]
        fn = sum(vals) if vals else None

    out = compute_regime(rets, fn)
    row = {
        "date": date.today().isoformat(),
        **out,
        "source_version": SOURCE_VERSION,
    }
    upsert("market_regime", [row], on_conflict="date")
    log.info("regime.done", **out, n=len(rets))
    return out
