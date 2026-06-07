"""밸류에이션 실행 — financials + 최신 시세 → valuations 적재.

라이브 실행은 Supabase + 적재된 financials/ohlcv 가 전제.
순수 계산은 ratios/dcf/relative 에서 테스트한다.
"""
from __future__ import annotations

from datetime import date

from engine.db import get_client, upsert
from engine.fundamental import dcf, ratios
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "valuation-v1"


def _latest_close(instrument_id: int) -> float | None:
    res = (
        get_client()
        .table("ohlcv")
        .select("close")
        .eq("instrument_id", instrument_id)
        .eq("interval", "1d")
        .order("ts", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return float(rows[0]["close"]) if rows else None


def _latest_financials(instrument_id: int) -> dict | None:
    res = (
        get_client()
        .table("financials")
        .select("*")
        .eq("instrument_id", instrument_id)
        .order("period", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def build_valuation_row(
    instrument_id: int,
    fin: dict,
    price: float | None,
    *,
    wacc: float = 0.09,
    growth: float = 0.05,
) -> dict | None:
    """단일 종목 valuations 행 산출 (순수 조립)."""
    shares = fin.get("shares")
    r = ratios.compute_ratios(fin, price=price, shares=shares)

    dcf_val = None
    fcf = fin.get("fcf") or fin.get("ocf")
    if fcf and shares:
        try:
            dcf_val = dcf.dcf_value(
                fcf0=fcf, shares=shares, wacc=wacc, growth=growth,
                net_debt=(fin.get("debt") or 0.0),
            ).intrinsic_per_share
        except ValueError:
            dcf_val = None

    row = {
        "instrument_id": instrument_id,
        "date": date.today().isoformat(),
        "per": r["per"],
        "pbr": r["pbr"],
        "ev_ebitda": r["ev_ebitda"],
        "roe": r["roe"],
        "dcf_value": dcf_val,
        "upside_pct": dcf.upside_pct(dcf_val, price),
        "method": {"wacc": wacc, "growth": growth, "source": fin.get("source")},
        "source_version": SOURCE_VERSION,
    }
    return row


def run(instrument_ids: list[int] | None = None) -> int:
    """대상 종목들의 밸류에이션을 산출·적재."""
    if instrument_ids is None:
        res = get_client().table("instruments").select("id").eq("active", True).execute()
        instrument_ids = [r["id"] for r in (res.data or [])]

    rows: list[dict] = []
    for iid in instrument_ids:
        fin = _latest_financials(iid)
        if not fin:
            continue
        price = _latest_close(iid)
        row = build_valuation_row(iid, fin, price)
        if row:
            rows.append(row)
    n = upsert("valuations", rows, on_conflict="instrument_id,date")
    log.info("valuation.run.done", rows=n)
    return n
