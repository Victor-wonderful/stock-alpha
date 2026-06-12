"""네이버 수급 변환 검증 — frgn.naver HTML → flows 행 (네트워크 없음)."""
from __future__ import annotations

import pandas as pd

from engine.ingest import naver

# frgn.naver 외국인·기관 표의 멀티헤더 구조를 축약 재현.
_HTML = """
<table class="type2">
  <thead>
    <tr><th>날짜</th><th>종가</th><th>전일비</th><th>등락률</th><th>거래량</th>
        <th>기관</th><th>외국인</th><th>외국인</th><th>외국인</th></tr>
    <tr><th>날짜</th><th>종가</th><th>전일비</th><th>등락률</th><th>거래량</th>
        <th>순매매량</th><th>순매매량</th><th>보유주수</th><th>보유율</th></tr>
  </thead>
  <tbody>
    <tr><td>2026.06.05</td><td>329,000</td><td>22,500</td><td>-6.40%</td>
        <td>31,299,200</td><td>-1,446,498</td><td>-4,240,844</td>
        <td>2,791,013,975</td><td>47.74%</td></tr>
    <tr><td>2026.06.04</td><td>351,500</td><td>9,000</td><td>-2.50%</td>
        <td>34,771,037</td><td>3,253,812</td><td>-12,414,744</td>
        <td>2,795,254,819</td><td>47.81%</td></tr>
  </tbody>
</table>
"""


def test_parse_frgn_table():
    df = naver.parse_frgn_table(_HTML)
    assert list(df.columns) == ["date", "inst_net", "foreign_net"]
    assert len(df) == 2
    first = df.iloc[0]
    assert first["date"] == "2026-06-05"
    assert first["inst_net"] == -1446498.0
    assert first["foreign_net"] == -4240844.0


def test_parse_frgn_table_no_match():
    df = naver.parse_frgn_table("<table><tr><td>무관</td></tr></table>")
    assert df.empty
    assert list(df.columns) == ["date", "inst_net", "foreign_net"]


def test_normalize_flows():
    df = pd.DataFrame(
        [
            {"date": "2026-06-05", "inst_net": -1446498.0, "foreign_net": -4240844.0},
            {"date": "2026-06-04", "inst_net": 3253812.0, "foreign_net": None},
        ]
    )
    rows = naver.normalize_flows(df, instrument_id=7)
    assert len(rows) == 2
    assert rows[0] == {
        "instrument_id": 7,
        "date": "2026-06-05",
        "inst_net": -1446498.0,
        "foreign_net": -4240844.0,
    }
    # foreign_net None 이면 키 자체를 넣지 않음
    assert "foreign_net" not in rows[1]
    assert rows[1]["inst_net"] == 3253812.0


def test_normalize_flows_empty():
    assert naver.normalize_flows(pd.DataFrame(), instrument_id=1) == []


def test_to_float():
    assert naver._to_float("-1,446,498") == -1446498.0
    assert naver._to_float("") is None
    assert naver._to_float("-") is None
    assert naver._to_float(None) is None

# ── 지수(코스피·코스닥) ──

_INDEX_HTML = """
<table>
  <tr><th>날짜</th><th>체결가</th><th>전일비</th><th>등락률</th><th>거래량(천주)</th><th>거래대금(백만)</th></tr>
  <tr><td>2026.06.12</td><td>8,123.62</td><td>359.67</td><td>+4.63%</td><td>493,406</td><td>52,257,644</td></tr>
  <tr><td>2026.06.11</td><td>7,763.95</td><td>33.13</td><td>+0.43%</td><td>478,730</td><td>46,400,773</td></tr>
  <tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>
"""


def test_parse_index_table():
    df = naver.parse_index_table(_INDEX_HTML)
    assert len(df) == 2
    assert df.iloc[0]["date"] == "2026-06-12"
    assert df.iloc[0]["close"] == 8123.62


def test_parse_index_table_no_match():
    df = naver.parse_index_table("<table><tr><th>foo</th></tr><tr><td>1</td></tr></table>")
    assert df.empty


def test_normalize_index():
    df = naver.parse_index_table(_INDEX_HTML)
    rows = naver.normalize_index(df, "KOSPI")
    assert rows == [
        {"series_id": "KOSPI", "date": "2026-06-12", "value": 8123.62, "source": "NAVER"},
        {"series_id": "KOSPI", "date": "2026-06-11", "value": 7763.95, "source": "NAVER"},
    ]

# ── KIS 지수 ──

def test_kis_normalize_index_output():
    from engine.ingest import kis
    out = kis.normalize_index_output([
        {"stck_bsop_date": "20260612", "bstp_nmix_prpr": "8123.62"},
        {"stck_bsop_date": "20260611", "bstp_nmix_prpr": "7763.95"},
        {"stck_bsop_date": "", "bstp_nmix_prpr": "1"},
        {"stck_bsop_date": "20260610", "bstp_nmix_prpr": None},
    ])
    assert out == [
        {"date": "2026-06-11", "close": 7763.95},
        {"date": "2026-06-12", "close": 8123.62},
    ]


def test_kis_to_macro_rows():
    from engine.ingest import kis
    rows = kis.to_macro_rows("KOSPI", [{"date": "2026-06-12", "close": 8123.62}])
    assert rows == [{"series_id": "KOSPI", "date": "2026-06-12", "value": 8123.62, "source": "KIS"}]

# ── KIS 수급·분봉 ──

def test_kis_normalize_investor():
    from engine.ingest import kis
    out = kis.normalize_investor([
        {"stck_bsop_date": "20260612", "prsn_ntby_qty": "-5933301", "frgn_ntby_qty": "2880306", "orgn_ntby_qty": "3295009"},
        {"stck_bsop_date": "bad"},
    ])
    assert out == [{"date": "2026-06-12", "retail_net": -5933301.0, "foreign_net": 2880306.0, "inst_net": 3295009.0}]


def test_kis_merge_flow_rows():
    from engine.ingest import kis
    inv = [{"date": "2026-06-12", "retail_net": -10.0, "foreign_net": 5.0, "inst_net": 5.0}]
    prog = [{"date": "2026-06-12", "program_net": 3.0}]
    out = kis.merge_flow_rows(7, inv, prog, days=9999)
    assert out == [{"instrument_id": 7, "date": "2026-06-12", "retail_net": -10.0, "foreign_net": 5.0, "inst_net": 5.0, "program_net": 3.0}]


def test_kis_normalize_minute_bars():
    from engine.ingest import kis
    out = kis.normalize_minute_bars([
        {"stck_bsop_date": "20260612", "stck_cntg_hour": "093000", "stck_oprc": "100", "stck_hgpr": "110", "stck_lwpr": "90", "stck_prpr": "105", "cntg_vol": "1000"},
        {"stck_bsop_date": "20260612", "stck_cntg_hour": "bad"},
    ], 5)
    assert out == [{
        "instrument_id": 5, "ts": "2026-06-12T09:30:00+09:00", "interval": "1m",
        "open": 100.0, "high": 110.0, "low": 90.0, "close": 105.0, "volume": 1000.0,
    }]


def test_parse_fx_table():
    html = (
        "<table><tr><th>날짜</th><th>매매기준율</th><th>전일대비</th></tr>"
        "<tr><td>2026.06.12</td><td>1,519.20</td><td>0.2</td></tr>"
        "<tr><td></td><td></td><td></td></tr></table>"
    )
    df = naver.parse_fx_table(html)
    assert len(df) == 1
    assert df.iloc[0]["date"] == "2026-06-12"
    assert df.iloc[0]["value"] == 1519.2
