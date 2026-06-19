"""데이터 신선도 가드 — 낡은 OHLCV 로 '최신 종가 분석' 산출물을 발행하는 사고 차단.

사고(2026-06-19): 가격 인제스트가 종목별로 다른 날짜(06-12~06-18)에서 멈춘 채
데일리 배치가 진행 → 픽 진입가가 3~7거래일 낡은 종가인데 'as_of(금) 종가 분석'
으로 발행됐다. 사용자가 "어제 종가라며 보여주는 가격이 실제와 다르다"고 관측.

두 겹 방어:
  · 유니버스 가드(assess_dates): 다수 종목이 as_of 봉을 못 가지면 발행 중단(빈 날).
  · 종목별 가드(fresh_frames): 최신 봉이 as_of 보다 낡은 종목은 시그널/픽에서 제외.

날짜 비교는 ISO 'YYYY-MM-DD' 문자열 사전순(=시간순)으로 안전하다.
"""
from __future__ import annotations

import pandas as pd

from engine.logging import get_logger

log = get_logger(__name__)

# 발행을 진행하려면 유니버스의 이 비율 이상이 as_of(목표 거래일) 봉을 보유해야 한다.
# 한국 주식은 거래정지/신규상장이 아니면 매 거래일 봉이 생기므로, 정상 인제스트면
# 대다수가 as_of 봉을 갖는다. 0.60 미만이면 인제스트 실패/지연 또는 장중·휴장 실행.
MIN_FRESH_FRAC = 0.60


def frame_last_date(df: pd.DataFrame | None) -> str | None:
    """프레임 마지막 봉 날짜(YYYY-MM-DD). ts 컬럼 없거나 비면 None."""
    if df is None or getattr(df, "empty", True) or "ts" not in df.columns:
        return None
    return str(df["ts"].iloc[-1])[:10]


def assess_dates(last_by_iid: dict[int, str | None], as_of: str) -> dict:
    """종목별 최신 봉 날짜 맵 → as_of 신선도 요약.

    fresh = 최신 봉이 as_of 이상(>=)인 종목. (과거일 백필이면 모두 fresh → 통과)
    ok = fresh 비율이 MIN_FRESH_FRAC 이상.
    """
    n = len(last_by_iid)
    dates = [d for d in last_by_iid.values() if d]
    n_fresh = sum(1 for d in last_by_iid.values() if d is not None and d >= as_of)
    frac = (n_fresh / n) if n else 0.0
    return {
        "as_of": as_of, "n": n, "n_fresh": n_fresh,
        "fresh_frac": round(frac, 4),
        "market_latest": max(dates) if dates else None,
        "ok": n > 0 and frac >= MIN_FRESH_FRAC,
    }


def assess_frames(frames: dict[int, pd.DataFrame], as_of: str) -> dict:
    """프레임 맵 버전 assess (ts 컬럼에서 날짜 추출)."""
    return assess_dates(
        {iid: frame_last_date(df) for iid, df in frames.items()}, as_of
    )


def fresh_frames(
    frames: dict[int, pd.DataFrame], as_of: str
) -> tuple[dict[int, pd.DataFrame], list[int]]:
    """최신 봉이 as_of 이상인 프레임만 남긴다. 반환: (fresh, 제외된 iid 목록).

    ts 없는 프레임(REST 폴백 누락 등)은 보수적으로 제외 — 신선도 미검증분을
    '최신 종가'로 발행하지 않는다.
    """
    fresh: dict[int, pd.DataFrame] = {}
    stale: list[int] = []
    for iid, df in frames.items():
        d = frame_last_date(df)
        if d is not None and d >= as_of:
            fresh[iid] = df
        else:
            stale.append(iid)
    return fresh, stale
