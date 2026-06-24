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

SOURCE_VERSION = "regime-v3"

# 추세/횡보 경계 — 종목별 20일 효율성비율(ER) 평균. ER↑=방향성(추세), ↓=경로 꼬임(횡보).
ER_TREND = 0.40


def efficiency_ratio(close: pd.Series, n: int = 20) -> float | None:
    """Kaufman 효율성비율 = |순변동| / Σ|일별변동| (0~1). 1=완전추세, 0=완전횡보."""
    if len(close) < n + 1:
        return None
    seg = close.iloc[-(n + 1):]
    net = abs(float(seg.iloc[-1]) - float(seg.iloc[0]))
    path = float(seg.diff().abs().sum())
    return net / path if path > 0 else 0.0


def compute_regime(
    returns_20d: list[float], foreign_net_5d: float | None,
    avg_er: float | None = None,
) -> dict:
    """레짐 점수·동인·구조 산출 (순수 함수).

    returns_20d: 종목별 20일 수익률 단면.
    foreign_net_5d: 최근 5일 외국인 순매수 합(KRW). None 이면 수급 축 제외.
    avg_er: 종목별 효율성비율 평균(추세/횡보 축). None 이면 구조 축 제외.
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

    # ── 2축: 방향(score) × 추세강도(ER) → 4국면(market_state) ──
    # 방향이 강하면(|score|>0.2) 그게 우선 = 상승/하락추세(ER 무관). 평균회귀가
    # 통하는 '진짜 횡보'는 방향이 약한 중립 구간 + 저ER(가격이 평균 주위 진동)일 때만.
    # → -18%·상승5% 같은 강한 하락은 ER이 낮아도 '하락추세'로 분류(역추세·수급 라우팅).
    structure: str | None = None
    market_state: str | None = None
    if avg_er is not None:
        structure = "trend" if avg_er >= ER_TREND else "chop"
        drivers.append(f"추세강도 ER {avg_er:.2f}")
        if score > 0.2:
            market_state = "uptrend"          # 상승추세 — 추세추종 우호
        elif score < -0.2:
            market_state = "downtrend"        # 하락추세 — 역추세·수급·방어
        elif structure == "chop":
            market_state = "range"            # 중립+저ER = 횡보 — 평균회귀 우호
        else:
            market_state = "transition"       # 중립+추세 = 방향 전환 구간

    return {
        "regime": regime, "score": score, "drivers": drivers,
        "structure": structure, "market_state": market_state,
    }


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

    # 추세/횡보 축 — 종목별 효율성비율 평균
    ers = [
        efficiency_ratio(df["close"]) for df in frames.values() if len(df) >= 21
    ]
    ers = [e for e in ers if e is not None]
    avg_er = sum(ers) / len(ers) if ers else None

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

    out = compute_regime(rets, fn, avg_er)
    row = {
        "date": date.today().isoformat(),
        **out,
        "source_version": SOURCE_VERSION,
    }
    upsert("market_regime", [row], on_conflict="date")
    log.info("regime.done", **out, n=len(rets))
    return out
