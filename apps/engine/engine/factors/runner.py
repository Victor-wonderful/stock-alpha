"""팩터 엔진 실행 — 종목 단면 구성 → 팩터 z-score·합성 알파 → factor_scores 적재."""
from __future__ import annotations

from datetime import date

import pandas as pd

from engine.db import get_client, upsert
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


def _load_cross_section() -> pd.DataFrame:
    """instruments + 최신 financials + 최신 close 로 단면 구성.

    momentum/volatility/growth 등 시계열 파생은 M4 후속에서 보강.
    """
    client = get_client()
    inst = client.table("instruments").select("id,sector").eq("active", True).execute().data or []
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
            .order("ts", desc=True).limit(1).execute()
        )
        px = (px_res.data or [{}])
        price = float(px[0]["close"]) if px and px[0].get("close") is not None else None
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
        })
    return pd.DataFrame(records).set_index("instrument_id")
