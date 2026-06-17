"""밸류에이션 실행 — financials + 최신 시세 → valuations 적재.

라이브 실행은 Supabase + 적재된 financials/ohlcv 가 전제.
순수 계산은 ratios/dcf/relative 에서 테스트한다.
"""
from __future__ import annotations

from datetime import date

from engine.db import get_client, select_all, upsert
from engine.fundamental import dcf, ratios
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "valuation-v2"   # v2: 신뢰 가드(밴드 밖 None) + OCF 보수추정

# ── 밸류에이션 신뢰 가드 ──
# 소형주·일회성 이익에서 DCF 적정가/PER 가 비현실적으로 폭주(+1000% upside, PER<1)
# → "믿을 수 있을 때만 값을 저장, 아니면 None". 쓰레기 발행 금지(포커스 게이트와 동일 철학).
FCF_FROM_OCF_HAIRCUT = 0.7        # FCF 미적재 시 OCF×0.7 로 보수 추정(capex 근사 차감)
DCF_TRUST_BAND = (0.2, 3.0)       # 적정가/현재가 신뢰 구간 — 밖이면 dcf/upside None
PER_BAND = (2.5, 150.0)           # PER 신뢰 구간 — 일회성 이익(PER<2.5)·적자 왜곡 제외
ROE_MAX = 1.0                     # ROE>100% = 일회성/레버리지 아티팩트 → None


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
    """최신 '연간(FY)' 재무 — 분기 행이 섞여도 레벨 지표(PER 등)는 연간만.

    분기 손익을 연간으로 오인하면 PER 가 4배 부풀려진다(periods.py 참조).
    """
    res = (
        get_client()
        .table("financials")
        .select("*")
        .eq("instrument_id", instrument_id)
        .like("period", "%FY")
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
    as_of: date | None = None,
) -> dict | None:
    """단일 종목 valuations 행 산출 (순수 조립).

    as_of: 적재 일자. 미지정 시 date.today(). daily 배치의 as_of 와 정렬용.
    """
    shares = fin.get("shares")
    r = ratios.compute_ratios(fin, price=price, shares=shares)

    # 비율 신뢰 가드 — 일회성 이익/적자로 왜곡된 값은 저장하지 않는다(None).
    per = r["per"]
    if per is not None and not (PER_BAND[0] <= per <= PER_BAND[1]):
        per = None
    roe = r["roe"]
    if roe is not None and roe > ROE_MAX:
        roe = None

    # FCF 미적재 시 OCF 를 그대로 쓰면 DCF 가 부풀려진다 → 보수 추정(×0.7).
    dcf_val = None
    fcf = fin.get("fcf")
    if fcf is None and fin.get("ocf"):
        fcf = fin["ocf"] * FCF_FROM_OCF_HAIRCUT
    if fcf and shares:
        try:
            dcf_val = dcf.dcf_value(
                fcf0=fcf, shares=shares, wacc=wacc, growth=growth,
                net_debt=(fin.get("debt") or 0.0),
            ).intrinsic_per_share
        except ValueError:
            dcf_val = None

    up = dcf.upside_pct(dcf_val, price)
    # DCF 신뢰 밴드 — 적정가가 현재가의 [0.2, 3.0] 밖이면 신뢰 불가 → None.
    if dcf_val is not None and price:
        ratio = dcf_val / price
        if not (DCF_TRUST_BAND[0] <= ratio <= DCF_TRUST_BAND[1]):
            dcf_val, up = None, None

    row = {
        "instrument_id": instrument_id,
        "date": (as_of or date.today()).isoformat(),
        "per": per,
        "pbr": r["pbr"],
        "ev_ebitda": r["ev_ebitda"],
        "roe": roe,
        "dcf_value": dcf_val,
        "upside_pct": up,
        "method": {"wacc": wacc, "growth": growth, "source": fin.get("source"),
                   "fcf_proxy": fin.get("fcf") is None},
        "source_version": SOURCE_VERSION,
    }
    return row


def run(instrument_ids: list[int] | None = None, *, as_of: str | None = None) -> int:
    """대상 종목들의 밸류에이션을 산출·적재.

    instrument_ids=None(전체)일 때는 직접 PG 벌크 읽기로 financials/close 를 각 1쿼리에
    가져와 종목별 왕복(수천 회)을 제거한다(가용 시). 특정 종목 지정 시는 기존 N+1 경로.
    as_of: 적재 일자(YYYY-MM-DD). 미지정 시 date.today().
    """
    as_of_date = date.fromisoformat(as_of) if as_of else None

    if instrument_ids is None:
        from engine import db_direct
        if db_direct.available():
            fins = db_direct.load_latest_financials_fy()
            closes = db_direct.load_latest_close_1d()
            rows = [
                row
                for iid, fin in fins.items()
                if (row := build_valuation_row(
                    iid, fin, closes.get(iid), as_of=as_of_date)) is not None
            ]
            n = upsert("valuations", rows, on_conflict="instrument_id,date")
            log.info("valuation.run.done", rows=n, path="bulk")
            return n
        instrument_ids = [r["id"] for r in select_all("instruments", "id", eq={"active": True})]

    rows = []
    for iid in instrument_ids:
        fin = _latest_financials(iid)
        if not fin:
            continue
        price = _latest_close(iid)
        row = build_valuation_row(iid, fin, price, as_of=as_of_date)
        if row:
            rows.append(row)
    n = upsert("valuations", rows, on_conflict="instrument_id,date")
    log.info("valuation.run.done", rows=n, path="rest")
    return n
