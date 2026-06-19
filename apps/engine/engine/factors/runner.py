"""팩터 엔진 실행 — 종목 단면 구성 → 팩터 z-score·합성 알파 → factor_scores 적재."""
from __future__ import annotations

from datetime import date

import pandas as pd

from engine.db import get_client, select_all, upsert
from engine.factors.compose import composite_alpha, regime_weights, zscore_factors
from engine.factors.factors import compute_raw_factors
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "factor-v2"  # v2: 레짐별 동적 가중(compose.regime_weights)


def build_factor_scores(
    cross: pd.DataFrame,
    asof: str | None = None,
    weights: dict[str, float] | None = None,
    source_version: str | None = None,
) -> list[dict]:
    """단면 DataFrame(index=instrument_id, 'sector' + raw 입력 컬럼) → factor_scores 행.

    순수 함수 — DB 없이 테스트 가능. source_version 으로 사용 가중(레짐) 을 기록한다.
    """
    if cross.empty:
        return []
    asof = asof or date.today().isoformat()
    sectors = cross["sector"] if "sector" in cross else None

    # None 혼합 컬럼(object dtype)은 concat/mean 경로에서 pd.NA 를 만들어
    # 이후 astype(float) 를 죽인다 → 숫자 컬럼을 입구에서 강제 coerce.
    cross = cross.copy()
    for c in cross.columns:
        if c != "sector":
            cross[c] = pd.to_numeric(cross[c], errors="coerce")

    sv = source_version or SOURCE_VERSION
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
            "source_version": sv,
        })
    return rows


def _f(v) -> float | None:
    return None if v is None or pd.isna(v) else round(float(v), 4)


def run(asof: str | None = None, regime: str | None = None) -> int:
    """DB 에서 단면을 구성해 factor_scores 적재. (입력 데이터 적재가 전제)

    regime 미지정 시 market_regime 최신 행을 읽어 레짐별 가중(compose.regime_weights)
    을 적용한다. 데일리 배치는 regime 을 명시 전달(같은 거래일 산출값 재사용).
    """
    cross = _load_cross_section()
    if regime is None:
        regime = _load_latest_regime()
    weights = regime_weights(regime)
    sv = f"{SOURCE_VERSION}:{regime or 'neutral'}"
    rows = build_factor_scores(cross, asof, weights=weights, source_version=sv)
    n = upsert("factor_scores", rows, on_conflict="instrument_id,date")
    log.info("factor.run.done", rows=n, regime=regime or "neutral", weights=weights)
    return n


def _load_latest_regime() -> str | None:
    """market_regime 최신 레짐 (date 오름차순 마지막). 없으면 None(기본 가중)."""
    rows = sorted(
        select_all("market_regime", "date,regime"),
        key=lambda r: r.get("date") or "",
    )
    return rows[-1].get("regime") if rows else None


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


def _load_closes_bulk(bars: int = 160) -> dict[int, list[float]]:
    """전 종목 종가 히스토리(최근 `bars` 봉, 시간 오름차순)를 벌크 로드.

    db_direct(직접 PG 서버사이드 커서) 우선 — 종목별 REST 호출(수천 왕복·수십 분)을
    단일 스트리밍 쿼리(~수십 초)로 대체. 실패 시 REST 종목별 폴백(백테스트와 동일 패턴).
    """
    from engine import db_direct

    if db_direct.available():
        try:
            return db_direct.load_all_close_1d(bars=bars, active_only=True)
        except Exception as e:  # noqa: BLE001
            log.warning("factors.direct_pg_failed_fallback_rest", error=str(e)[:140])

    client = get_client()
    out: dict[int, list[float]] = {}
    for it in select_all("instruments", "id", eq={"active": True}):
        px = (
            client.table("ohlcv").select("close")
            .eq("instrument_id", it["id"]).eq("interval", "1d")
            .order("ts", desc=True).limit(bars).execute()
        )
        out[it["id"]] = [
            float(r["close"]) for r in reversed(px.data or [])
            if r.get("close") is not None
        ]
    return out


def _load_cross_section() -> pd.DataFrame:
    """instruments + financials + 가격 히스토리(모멘텀·변동성) 로 단면 구성.

    가격팩터(momentum/lowvol)는 ohlcv 히스토리에서 산출 → 전 종목 적용.
    재무팩터(value/quality/size)는 financials 있는 종목만(composite 가 가중 재정규화).

    레벨 지표는 최신 '연간(FY)' 행만 사용 — 분기 행이 섞이면 문자열 정렬상
    "2026Q1" > "2025FY" 라 분기 손익을 연간으로 오인한다(periods.py 참조).
    growth 는 같은 보고서 타입의 전년 동기 YoY(분기 이력 확보 시 활성).
    """
    from engine.fundamental.periods import latest_annual, yoy_growth

    inst = select_all("instruments", "id,sector", eq={"active": True})
    if not inst:
        return pd.DataFrame()

    # financials 는 벌크 1회 로드(수천~수만 행) 후 종목별 그룹 — 종목당 쿼리 제거.
    fins: dict[int, list[dict]] = {}
    for r in select_all("financials", "*"):
        fins.setdefault(r["instrument_id"], []).append(r)

    # 가격 히스토리도 벌크 1회 로드 — 종목별 REST(수천 왕복·~40분)를 직접 PG
    # 벌크 스트리밍(~수십 초)으로 대체. 데일리 배치 최대 병목 해소.
    closes_by_iid = _load_closes_bulk()

    records: list[dict] = []
    for it in inst:
        iid = it["id"]
        fin_rows = fins.get(iid, [])
        fin = latest_annual(fin_rows) or {}
        rev_g, eps_g = yoy_growth(fin_rows)
        closes = closes_by_iid.get(iid, [])
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
            "rev_growth": rev_g,
            "eps_growth": eps_g,
        })
    return pd.DataFrame(records).set_index("instrument_id")
