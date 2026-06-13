"""횡단면 백테스트 — factor_composite(종목 선별 전략) 검증.

이벤트 백테스트(진입/청산)로 검증할 수 없는 전략 → 두 질문으로 검증:
  ① 시점별 팩터 점수가 미래 수익률 순위를 예측하는가 (IC, 스피어만)
  ② 점수 상위 10%(시그널 발행 기준과 동일)를 사면 유니버스 대비 초과수익인가

point-in-time 제약(정직성): 재무 팩터(value/quality/growth)는 단일 연도
스냅샷이라 과거 시점 재현 시 미래 정보 유입(look-ahead) → **가격 팩터
(momentum 12-1 근사 + lowvol)만으로 검증**한다. 검증 대상은 가격 팩터 합성
(프로덕션 가중 0.20/0.10 → 재정규화 2/3·1/3)이며, 전체 합성의 부분 검증임을
backtests.params 에 기록한다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import pandas as pd

from engine.backtest.metrics import information_coefficient, max_drawdown
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "xsec-v1"

REBALANCE_BARS = 5    # 주간(비중첩) 리밸런스 — 250봉 이력 → 표본 ~40기
FWD_BARS = 5          # 미래수익 측정 구간
MOM_LOOKBACK = 120    # 12-1 모멘텀 근사: 직전 1개월 제외한 6개월 수익률
MOM_SKIP = 21
VOL_WINDOW = 60
TOP_QUANTILE = 0.90   # 시그널 발행 기준(상위 10%)과 동일
MIN_NAMES = 100       # 기당 최소 유효 종목 수

# 프로덕션 합성 가중(compose.DEFAULT_WEIGHTS)에서 가격 팩터만 재정규화
W_MOMENTUM = 0.20 / 0.30
W_LOWVOL = 0.10 / 0.30


@dataclass
class XsecThresholds:
    min_periods: int = 20          # 리밸런스 표본 수
    min_mean_ic: float = 0.02      # 평균 IC (스피어만)
    min_ic_positive: float = 0.55  # IC 양수 기간 비율
    min_spread_t: float = 2.0      # 상위10% 초과수익 t-stat (유의성)


@dataclass
class XsecResult:
    passed: bool
    n_periods: int
    mean_ic: float | None
    ic_positive_ratio: float | None
    excess_mean: float | None      # 기당 상위10% 초과수익(유니버스 대비)
    excess_t: float | None
    excess_mdd: float | None       # 초과수익 누적 곡선 MDD
    reasons: list[str]


def _zscore(s: pd.Series) -> pd.Series:
    sd = s.std()
    if sd is None or sd == 0 or pd.isna(sd):
        return s * 0.0
    return (s - s.mean()) / sd


def price_factor_scores(closes: pd.DataFrame, i: int) -> pd.Series:
    """i번째 봉 시점의 가격 팩터 합성 점수 (point-in-time, 순수 함수).

    closes: [봉 × 종목] 종가 와이드 프레임 (시간 오름차순).
    """
    past = closes.iloc[i - MOM_SKIP]
    base = closes.iloc[i - MOM_SKIP - MOM_LOOKBACK]
    momentum = past / base - 1

    window = closes.iloc[i - VOL_WINDOW : i + 1]
    lowvol = -window.pct_change().std()

    mom_z = _zscore(momentum.dropna()).reindex(closes.columns)
    vol_z = _zscore(lowvol.dropna()).reindex(closes.columns)
    score = W_MOMENTUM * mom_z + W_LOWVOL * vol_z
    return score


def evaluate_cross_section(
    closes: pd.DataFrame, thr: XsecThresholds | None = None
) -> XsecResult:
    """와이드 종가 프레임 → 횡단면 검증 결과 (순수 함수)."""
    thr = thr or XsecThresholds()
    start = MOM_SKIP + MOM_LOOKBACK + VOL_WINDOW
    ics: list[float] = []
    excesses: list[float] = []

    for i in range(start, len(closes) - FWD_BARS, REBALANCE_BARS):
        score = price_factor_scores(closes, i)
        fwd = closes.iloc[i + FWD_BARS] / closes.iloc[i] - 1
        df = pd.DataFrame({"score": score, "fwd": fwd}).dropna()
        if len(df) < MIN_NAMES:
            continue
        ic = information_coefficient(df["score"].tolist(), df["fwd"].tolist())
        if ic is None:
            continue
        ics.append(ic)
        top = df[df["score"] >= df["score"].quantile(TOP_QUANTILE)]
        excesses.append(float(top["fwd"].mean() - df["fwd"].mean()))

    n = len(ics)
    mean_ic = sum(ics) / n if n else None
    pos = sum(1 for x in ics if x > 0) / n if n else None
    ex_mean = sum(excesses) / n if n else None
    if n >= 2 and ex_mean is not None:
        var = sum((x - ex_mean) ** 2 for x in excesses) / (n - 1)
        sd = math.sqrt(var)
        ex_t = ex_mean / (sd / math.sqrt(n)) if sd > 0 else None
    else:
        ex_t = None
    eq = [1.0]
    for x in excesses:
        eq.append(eq[-1] * (1 + x))
    ex_mdd = max_drawdown(eq)

    reasons: list[str] = []
    if n < thr.min_periods:
        reasons.append(f"표본 부족({n}<{thr.min_periods})")
    if mean_ic is None or mean_ic < thr.min_mean_ic:
        reasons.append(f"평균 IC 미달({mean_ic})")
    if pos is None or pos < thr.min_ic_positive:
        reasons.append(f"IC 양수 비율 미달({pos})")
    if ex_t is None or ex_t < thr.min_spread_t:
        reasons.append(f"초과수익 유의성 미달(t={ex_t})")

    return XsecResult(
        passed=not reasons, n_periods=n,
        mean_ic=round(mean_ic, 4) if mean_ic is not None else None,
        ic_positive_ratio=round(pos, 4) if pos is not None else None,
        excess_mean=round(ex_mean, 4) if ex_mean is not None else None,
        excess_t=round(ex_t, 4) if ex_t is not None else None,
        excess_mdd=round(ex_mdd, 4) if ex_mdd is not None else None,
        reasons=reasons,
    )


# ── DB 러너 ─────────────────────────────────────────────────────────

def _load_close_series(iid: int, limit: int = 420) -> pd.Series | None:
    from engine.db import get_client

    res = (
        get_client().table("ohlcv").select("ts,close")
        .eq("instrument_id", iid).eq("interval", "1d")
        .order("ts", desc=True).limit(limit).execute()
    )
    rows = list(reversed(res.data or []))
    if len(rows) < MOM_SKIP + MOM_LOOKBACK + VOL_WINDOW + 20:
        return None
    s = pd.Series(
        [float(r["close"]) for r in rows],
        index=[str(r["ts"])[:10] for r in rows],
        name=iid,
    )
    return s[~s.index.duplicated(keep="last")]


_MIN_BARS = MOM_SKIP + MOM_LOOKBACK + VOL_WINDOW + 20


def _load_close_panel() -> pd.DataFrame:
    """활성 종목 종가 와이드 프레임 — 직접 PG 벌크 우선, 실패 시 REST 폴백."""
    from engine import db_direct

    if db_direct.available():
        try:
            frames = db_direct.load_all_ohlcv_1d(bars=420)
            series = []
            for iid, df in frames.items():
                if len(df) < _MIN_BARS:
                    continue
                s = pd.Series(
                    df["close"].to_numpy(dtype=float),
                    index=df["ts"].astype(str).str.slice(0, 10), name=iid,
                )
                series.append(s[~s.index.duplicated(keep="last")])
            if series:
                return pd.concat(series, axis=1).sort_index()
        except Exception as e:  # noqa: BLE001
            log.warning("xsec.direct_pg_failed_fallback_rest", error=str(e)[:140])

    from engine.db import select_all
    inst = select_all("instruments", "id", eq={"active": True})
    series = []
    for it in inst:
        s = _load_close_series(it["id"])
        if s is not None:
            series.append(s)
    return pd.concat(series, axis=1).sort_index()


def run(thr: XsecThresholds | None = None) -> XsecResult:
    """유동 유니버스 종가 로드 → 횡단면 검증 → backtests 적재."""
    from engine.db import select_all, upsert
    from engine.liquidity import REPORT_TURNOVER_FLOOR_KRW  # noqa: F401 (문서 근거)
    from engine.liquidity import df_avg_turnover_krw

    closes = _load_close_panel()
    # 유동성 필터는 시그널 유니버스와 동일 기준을 쓰고 싶지만 거래대금 계산엔
    # volume 이 필요 → 종가만 로드하므로 factor_scores 발행 모집단(시그널과 동일
    # 풀)이 이미 유동성 필터를 거친다는 점에 의존. 검증은 전 종목 단면으로 수행
    # (더 보수적 — 비유동 노이즈 포함 시 IC 가 낮게 나옴).
    _ = df_avg_turnover_krw  # 명시적 참조(향후 volume 포함 로드 시 사용)

    log.info("xsec.loaded", instruments=closes.shape[1], bars=closes.shape[0])
    r = evaluate_cross_section(closes, thr)
    upsert("backtests", [{
        "strategy_key": "cross_section:factor_composite",
        "setup": "factor_composite",
        "params": {
            "method": "price-factor proxy (momentum 12-1 + lowvol, 2/3·1/3)",
            "rebalance_bars": REBALANCE_BARS,
            "thresholds": (thr or XsecThresholds()).__dict__,
            "n_periods": r.n_periods,
            "excess_mean": r.excess_mean,
            "excess_t": r.excess_t,
            "note": "재무 팩터는 point-in-time 불가로 제외 — 부분(하한) 검증",
        },
        "ic": r.mean_ic,
        "win_rate": r.ic_positive_ratio,   # IC 양수 기간 비율
        "mdd": r.excess_mdd,
        "sharpe": r.excess_t,              # 초과수익 t-stat 저장
        "passed": r.passed,
        "period": f"weekly x {r.n_periods}",
    }])
    log.info("xsec.done", passed=r.passed, mean_ic=r.mean_ic,
             ic_pos=r.ic_positive_ratio, excess_t=r.excess_t, reasons=r.reasons)
    return r
