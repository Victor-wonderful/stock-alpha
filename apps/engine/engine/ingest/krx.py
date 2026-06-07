"""KRX 인제스트 — pykrx 기반 OHLCV · 투자자별 순매수 · 공매도.

설계: 네트워크 호출(pykrx)과 변환을 분리한다.
  · fetch_*    : pykrx 호출 (지연 import, 키 불필요)
  · normalize_*: 순수 함수 — DataFrame → 테이블 행. 네트워크 없이 테스트 가능.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

# ── 컬럼 매핑 (pykrx 한글 컬럼 → 스키마) ──
_OHLCV_COLS = {
    "시가": "open", "고가": "high", "저가": "low", "종가": "close", "거래량": "volume",
}
# 투자자별 순매수: 가능한 한글 표기들을 우리 컬럼으로
_FLOW_COLS = {
    "기관합계": "inst_net", "기관": "inst_net",
    "외국인합계": "foreign_net", "외국인": "foreign_net",
    "개인": "retail_net",
    "프로그램": "program_net",
}


def normalize_ohlcv(df: pd.DataFrame, instrument_id: int, interval: str = "1d") -> list[dict]:
    """pykrx OHLCV DataFrame(날짜 인덱스) → ohlcv 행 리스트."""
    if df is None or df.empty:
        return []
    out: list[dict] = []
    for idx, row in df.iterrows():
        ts = pd.Timestamp(idx)
        rec: dict[str, Any] = {
            "instrument_id": instrument_id,
            "ts": ts.isoformat(),
            "interval": interval,
        }
        for ko, en in _OHLCV_COLS.items():
            if ko in df.columns:
                rec[en] = float(row[ko])
        # 필수 OHLC 가 모두 있어야 유효
        if all(k in rec for k in ("open", "high", "low", "close")):
            rec.setdefault("volume", 0.0)
            out.append(rec)
    return out


def normalize_flows(df: pd.DataFrame, instrument_id: int) -> list[dict]:
    """투자자별 순매수 DataFrame(날짜 인덱스) → flows 행 리스트."""
    if df is None or df.empty:
        return []
    out: list[dict] = []
    for idx, row in df.iterrows():
        rec: dict[str, Any] = {
            "instrument_id": instrument_id,
            "date": pd.Timestamp(idx).date().isoformat(),
        }
        for ko, en in _FLOW_COLS.items():
            if ko in df.columns:
                rec[en] = float(row[ko])
        if len(rec) > 2:  # 날짜·종목 외 실제 수급값이 하나라도 있을 때
            out.append(rec)
    return out


def merge_short_into_flows(
    flows: list[dict], short_vol: pd.DataFrame | None, short_bal: pd.DataFrame | None,
) -> list[dict]:
    """공매도 거래량/잔고를 날짜 기준으로 flows 행에 병합."""
    by_date = {r["date"]: r for r in flows}

    def _apply(df: pd.DataFrame | None, col_candidates: list[str], target: str) -> None:
        if df is None or df.empty:
            return
        col = next((c for c in col_candidates if c in df.columns), None)
        if col is None:
            return
        for idx, row in df.iterrows():
            d = pd.Timestamp(idx).date().isoformat()
            rec = by_date.setdefault(d, {"date": d})
            rec[target] = float(row[col])

    _apply(short_vol, ["공매도", "공매도거래량", "거래량"], "short_volume")
    _apply(short_bal, ["공매도잔고", "잔고수량", "잔고"], "short_balance")

    # instrument_id 채우기 (flows 에서 가져옴)
    iid = flows[0]["instrument_id"] if flows else None
    rows = list(by_date.values())
    if iid is not None:
        for r in rows:
            r.setdefault("instrument_id", iid)
    return [r for r in rows if "instrument_id" in r]


# ── 네트워크 fetch (pykrx 지연 import) ──

def fetch_ohlcv(ticker: str, fromdate: str, todate: str) -> pd.DataFrame:
    """일봉 OHLCV. 날짜는 'YYYYMMDD'."""
    from pykrx import stock  # lazy

    return stock.get_market_ohlcv(fromdate, todate, ticker)


class FlowsUnavailable(RuntimeError):
    """KRX 수급/공매도 엔드포인트가 빈 응답(업스트림 pykrx/KRX 이슈)."""


def _safe_krx(fn: Any, *args: Any) -> pd.DataFrame:
    """pykrx 호출 래퍼. 엔드포인트가 죽어 빈 본문/KeyError 면 빈 DataFrame 반환.

    2026 현재 KRX 백엔드 변경으로 투자자 수급·공매도 계열 pykrx 함수가 빈
    HTTP 본문('Expecting value')을 반환하며, pykrx 내부에서 Key('거래량') 등으로
    터진다. OHLCV 만 정상. 종목 단위로 시끄럽게 실패하지 않도록 흡수한다.
    """
    try:
        df = fn(*args)
    except (KeyError, ValueError):  # pykrx 내부 빈응답 파싱 실패
        return pd.DataFrame()
    return df if df is not None else pd.DataFrame()


def fetch_flows(ticker: str, fromdate: str, todate: str) -> pd.DataFrame:
    """투자자별 순매수(거래대금 기준). 엔드포인트 불가 시 빈 DataFrame."""
    from pykrx import stock

    return _safe_krx(stock.get_market_trading_value_by_date, fromdate, todate, ticker)


def fetch_short(ticker: str, fromdate: str, todate: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(공매도 거래량 df, 공매도 잔고 df). 엔드포인트 불가 시 빈 DataFrame 쌍."""
    from pykrx import stock

    vol = _safe_krx(stock.get_shorting_volume_by_date, fromdate, todate, ticker)
    bal = _safe_krx(stock.get_shorting_balance_by_date, fromdate, todate, ticker)
    return vol, bal
