"""네이버 금융 수급 인제스트 — 종목별 외국인·기관 순매매.

pykrx 의 KRX 투자자수급 엔드포인트가 업스트림 breakage(빈 응답)라, 살아있는
대체 소스로 네이버 금융(finance.naver.com/item/frgn.naver)을 사용한다.

  · fetch_*      : httpx 호출 (euc-kr).
  · parse_/normalize_ : 순수 함수 — HTML/DataFrame → flows 행. 네트워크 없이 테스트.

제공: 날짜·기관 순매매량·외국인 순매매량(주식수). 개인/프로그램/공매도는 이 페이지에
없음 → retail_net/program_net/short_* 는 미설정(다른 소스 필요).
"""
from __future__ import annotations

import io
from typing import Any

import pandas as pd

from engine.logging import get_logger

log = get_logger(__name__)

_BASE = "https://finance.naver.com/item/frgn.naver"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
}


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    s = str(v).replace(",", "").strip()
    if s in ("", "-", "nan", "NaN"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_frgn_table(html: str) -> pd.DataFrame:
    """frgn.naver HTML → [date, inst_net, foreign_net] DataFrame (순수).

    대상 테이블: (기관,순매매량)·(외국인,순매매량) 멀티헤더를 가진 표.
    """
    tables = pd.read_html(io.StringIO(html))
    target: pd.DataFrame | None = None
    for t in tables:
        cols = ["|".join(str(x) for x in (c if isinstance(c, tuple) else (c,))) for c in t.columns]
        joined = " ".join(cols)
        if "기관" in joined and "외국인" in joined and "순매매량" in joined:
            target = t
            break
    if target is None:
        return pd.DataFrame(columns=["date", "inst_net", "foreign_net"])

    # 멀티헤더 컬럼을 위치로 접근: 0=날짜, 5=기관순매매, 6=외국인순매매
    out: list[dict] = []
    for _, row in target.iterrows():
        vals = list(row.values)
        if len(vals) < 7:
            continue
        raw_date = str(vals[0]).strip()
        if not raw_date or raw_date in ("nan", "날짜") or "." not in raw_date:
            continue
        out.append({
            "date": raw_date.replace(".", "-"),       # 2026.06.05 → 2026-06-05
            "inst_net": _to_float(vals[5]),
            "foreign_net": _to_float(vals[6]),
        })
    return pd.DataFrame(out)


def normalize_flows(df: pd.DataFrame, instrument_id: int) -> list[dict]:
    """parse 결과 DataFrame → flows 행 리스트 (순수)."""
    if df is None or df.empty:
        return []
    rows: list[dict] = []
    for _, r in df.iterrows():
        date = r.get("date")
        inst = r.get("inst_net")
        foreign = r.get("foreign_net")
        inst = None if inst is None or pd.isna(inst) else float(inst)
        foreign = None if foreign is None or pd.isna(foreign) else float(foreign)
        if not date or (inst is None and foreign is None):
            continue
        rec: dict[str, Any] = {"instrument_id": instrument_id, "date": str(date)}
        if inst is not None:
            rec["inst_net"] = inst
        if foreign is not None:
            rec["foreign_net"] = foreign
        rows.append(rec)
    return rows


# ── 네트워크 fetch ──

def fetch_frgn(symbol: str, pages: int = 3) -> pd.DataFrame:
    """종목 외국인·기관 순매매 — 최근 pages 페이지(페이지당 ~20거래일) 누적."""
    import httpx

    frames: list[pd.DataFrame] = []
    headers = {**_HEADERS, "Referer": f"https://finance.naver.com/item/main.naver?code={symbol}"}
    for p in range(1, pages + 1):
        try:
            r = httpx.get(_BASE, params={"code": symbol, "page": str(p)}, headers=headers, timeout=20)
            r.raise_for_status()
            html = r.content.decode("euc-kr", errors="replace")
            frames.append(parse_frgn_table(html))
        except Exception as e:  # noqa: BLE001 — 페이지 단위 실패는 건너뜀
            log.warning("naver.frgn.page_fail", symbol=symbol, page=p, error=str(e))
    if not frames:
        return pd.DataFrame(columns=["date", "inst_net", "foreign_net"])
    out = pd.concat(frames, ignore_index=True).drop_duplicates(subset=["date"])
    return out
