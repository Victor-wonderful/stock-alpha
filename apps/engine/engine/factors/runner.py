"""팩터 엔진 실행 — 종목 단면 구성 → 팩터 z-score·합성 알파 → factor_scores 적재."""
from __future__ import annotations

from datetime import date

import pandas as pd

from engine.db import get_client, select_all, upsert
from engine.factors.compose import composite_alpha, zscore_factors
from engine.factors.factors import compute_raw_factors
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "factor-v1"


def build_factor_scores(
    cross: pd.DataFrame,
    asof: str | None = None,
    weights: dict[str, float] | None = None,
) -> list[dict]:
    """단면 DataFrame(index=instrument_id, 'sector' + raw 입력 컬럼) → factor_scores 행.

    순수 함수 — DB 없이 테스트 가능.
    """
    if cross.empty:
        return []
    asof = asof or date.today().isoformat()
    sectors = cross["sector"] if "sector" in cross else None

    raw = compute_raw_factors(cross)
    z = zscore_factors(raw, sectors)
    alpha = composite_alpha(z, weights)

    df = z.copy()
    df["composite_alpha"] = alpha
    df["sector"] = sectors if sectors is not None else "ALL"

    # 섹터 내 랭크 (composite_alpha 내림차순, 1 = 최고)
    df["sector_rank"] = (
        df.groupby("sector")["composite_alpha"]
        .rank(ascending=False, method="min")
    )

    rows: list[dict] = []
    for iid, r in df.iterrows():
        rows.append({
            "instrument_id": int(iid),
            "date": asof,
            "value_z": _f(r.get("value_z")),
            "quality_z": _f(r.get("quality_z")),
            "momentum_z": _f(r.get("momentum_z")),
            "growth_z": _f(r.get("growth_z")),
            "lowvol_z": _f(r.get("lowvol_z")),
            "size_z": _f(r.get("size_z")),
            "composite_alpha": _f(r.get("composite_alpha")),
            "sector_rank": int(r["sector_rank"]) if pd.notna(r.get("sector_rank")) else None,
            "source_version": SOURCE_VERSION,
        })
    return rows


def _f(v) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), 4)


def run(asof: str | None = None) -> int:
    """DB 에서 단면을 구성해 factor_scores 적재. (입력 데이터 적재가 전제)"""
    cross = _load_cross_section()
    rows = build_factor_scores(cross, asof)
    n = upsert("factor_scores", rows, on_conflict="instrument_id,date")
    log.info("factor.run.done", rows=n)
    return n


def _price_factors(closes: list[float]) -> tuple[float | None, float | None]:
    """가격 히스토리(오름차순) → (모멘텀 12-1, 일간변동성).

    가격팩터는 재무 없이 전 종목에 적용 가능 → 합성알파의 핵심 입력.
    """
    if len(closes) < 30:
        return None, None
    s = pd.Series(closes, dtype=float)
    rets = s.pct_change().dropna()
    vol = float(rets.std()) if len(rets) > 5 else None
    # 12-1 모멘텀: 최근 ~1개월(21거래일)을 제외한 누적 수익률(반전 효과 제거).
    if len(s) >= 40:
        recent, past = s.iloc[-21], s.iloc[0]
        mom = float(recent / past - 1) if past > 0 else None
    else:
        mom = None
    return mom, vol


def _load_cross_section() -> pd.DataFrame:
    """instruments + 최신 financials + 가격 히스토리(모멘텀·변동성) 로 단면 구성.

    가격팩터(momentum/lowvol)는 ohlcv 히스토리에서 산출 → 전 종목 적용.
    재무팩터(value/quality/size)는 financials 있는 종목만(composite 가 가중 재정규화).
    """
    client = get_client()
    inst = select_all("instruments", "id,sector", eq={"active": True})
    if not inst:
        return pd.DataFrame()

    records: list[dict] = []
    for it in inst:
        iid = it["id"]
        fin_res = (
            client.table("financials").select("*")
            .eq("instrument_id", iid).order("period", desc=True).limit(1).execute()
        )
        fin = (fin_res.data or [{}])[0]
        px_res = (
            client.table("ohlcv").select("close")
            .eq("instrument_id", iid).eq("interval", "1d")
            .order("ts", desc=True).limit(160).execute()
        )
        closes = [
            float(r["close"]) for r in reversed(px_res.data or [])
            if r.get("close") is not None
        ]
        price = closes[-1] if closes else None
        mom, vol = _price_factors(closes)
        shares = fin.get("shares")
        records.append({
            "instrument_id": iid,
            "sector": it.get("sector") or "ALL",
            "net_income": fin.get("net_income"),
            "equity": fin.get("equity"),
            "debt": fin.get("debt"),
            "revenue": fin.get("revenue"),
            "fcf": fin.get("fcf") or fin.get("ocf"),
            "eps": fin.get("eps"),
            "bps": fin.get("bps"),
            "price": price,
            "market_cap": (price * shares) if (price and shares) else None,
            "ret_12_1": mom,
            "volatility": vol,
        })
    return pd.DataFrame(records).set_index("instrument_id")
