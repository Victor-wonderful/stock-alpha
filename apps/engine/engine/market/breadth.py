"""시장 폭·조건부 실측 — 시황을 '예측'이 아니라 '과거 빈도'로 말하기 위한 재료.

왜 예측이 아닌가 (2026-08-16 측정, 합성 지수 442 거래일):
  아무것도 안 보고 매일 "오른다"고 해도 적중률 **55.3%** 다. 이 시장이 그 기간
  상승 편향이었기 때문이다. "오늘은 상승 전망" 이라고 쓰면 55%가 맞는데, 사용자는
  그걸 시스템의 실력으로 읽는다. 조건별 차이는 대부분 기준선 대비 1~2%p — 노이즈다.
  그나마 컸던 '3일 연속 상승 → 다음날 67%'도 표본 86건이고, **5일 수익률은 오히려
  기준선보다 낮았다**(방향은 이어졌지만 폭은 줄었다). 방향 적중과 수익은 다르다.

  이 프로젝트 원칙("백테스트 미통과 시그널 발행 금지")을 시장 전망에도 똑같이 적용하면
  지금 데이터로는 발행 자격이 없다. 그래서 예측 대신 **공시 성적표(event_evidence)와
  같은 방식** — "과거 같은 상황 N번 중 M번 올랐다"를 표본 수와 함께 그대로 보여준다.

  ⚠️ 화면·서술에서 기준선(baseline)을 반드시 함께 보여줄 것. 기준선 없이 "67%"만
  보이면 그게 실력으로 읽힌다.

지수 대용: 전 종목 동일가중 일간수익률. macro 의 KOSPI 시리즈는 65일치뿐이라
장기 빈도 계산에 못 쓴다(ohlcv 는 799 거래일).
"""
from __future__ import annotations

from dataclasses import dataclass

from engine.logging import get_logger

log = get_logger(__name__)

# 하루를 '시장'으로 인정할 최소 종목 수 — 데이터 결손일이 이상치로 섞이는 것 방지.
MIN_INSTRUMENTS = 300
# 빈도 계산에 쓸 최대 거래일. 길수록 표본이 늘지만 오래된 국면은 지금과 다르다.
LOOKBACK_DAYS = 800
# 표본이 이보다 적은 조건은 발행하지 않는다 — 우연을 근거처럼 보여주지 않기 위해.
MIN_SAMPLE = 30

_SQL = """
with r as (
  select o.ts::date d, o.instrument_id,
         o.close / nullif(lag(o.close) over (partition by o.instrument_id order by o.ts), 0) - 1 ret
  from ohlcv o join instruments i on i.id = o.instrument_id and i.active
  where o.interval = '1d'
)
select d, avg(ret) mkt,
       count(*) filter (where ret > 0)::float / count(*) breadth,
       count(*) filter (where ret > 0) up,
       count(*) filter (where ret < 0) down,
       count(*) n
from r
where ret is not null
group by d having count(*) > %s
order by d
"""


@dataclass(frozen=True)
class MarketDay:
    date: str
    ret: float          # 동일가중 시장 수익률
    breadth: float      # 오른 종목 비율 (0~1)
    up: int             # 오른 종목 수
    down: int           # 내린 종목 수 (보합은 어느 쪽도 아님 — up+down < n)
    n: int


def load_series(limit: int = LOOKBACK_DAYS) -> list[MarketDay]:
    """일별 시장 수익률·폭. 직접 PG 전용 — REST 로는 종목별 수천 왕복이라 안 쓴다.

    직접 PG 를 못 쓰면 빈 리스트를 반환한다(호출측이 시황 블록을 생략 → graceful).
    """
    from engine import db_direct
    if not db_direct.available():
        log.warning("breadth.no_direct_pg")
        return []
    import psycopg

    with psycopg.connect(db_direct._dsn()) as conn, conn.cursor() as cur:
        cur.execute(_SQL, (MIN_INSTRUMENTS,))
        rows = cur.fetchall()
    out = [MarketDay(str(d), float(m), float(b), int(u), int(dn), int(n))
           for d, m, b, u, dn, n in rows]
    return out[-limit:]


# ── 조건 정의 ──
# 각 조건은 (라벨, 성립 판정). 판정은 인덱스 i 시점까지의 정보만 본다(룩어헤드 금지).

def _streak(s: list[MarketDay], i: int, up: bool, k: int) -> bool:
    if i < k - 1:
        return False
    return all((s[i - j].ret > 0) == up and s[i - j].ret != 0 for j in range(k))


def _trend(s: list[MarketDay], i: int, w: int = 20) -> float | None:
    if i < w:
        return None
    acc = 1.0
    for j in range(i - w + 1, i + 1):
        acc *= 1 + s[j].ret
    return acc - 1


CONDITIONS: dict[str, callable] = {
    "3거래일 연속 상승": lambda s, i: _streak(s, i, True, 3),
    "3거래일 연속 하락": lambda s, i: _streak(s, i, False, 3),
    "오른 종목이 70%를 넘음": lambda s, i: s[i].breadth > 0.70,
    "내린 종목이 70%를 넘음": lambda s, i: s[i].breadth < 0.30,
    "20거래일 누적 +5% 초과": lambda s, i: (t := _trend(s, i)) is not None and t > 0.05,
    "20거래일 누적 -5% 미만": lambda s, i: (t := _trend(s, i)) is not None and t < -0.05,
}


# ── 해외 변수 조건 ──
# 시장 폭·연속성은 '한국장 자기 이력'이라 밤사이 일어난 일을 못 본다. 실측에서 가장
# 큰 차이를 낸 건 VIX 였다(오른 다음날 한국장 상승 38.2% vs 기준선 55.4%, n=55).
# 미10년물은 -0.7%p 로 사실상 없어서 넣지 않는다 — 있는 척하지 않는다.
#
# 신선도: FRED(VIXCLS)는 2~3거래일 늦어 '어젯밤'을 못 말한다. 네이버(VIX_NAVER)가
# 당일 종가를 준다. 과거 빈도는 이력이 긴 FRED 를 쓰고, 오늘 판정은 네이버를 쓴다.
MACRO_CONDITIONS: dict[str, tuple[str, str]] = {
    "VIX": ("공포지수(VIX)가 전일보다 상승", "up"),
}


def _load_macro(series_ids: tuple[str, ...]) -> dict[str, dict[str, float]]:
    from engine import db_direct
    if not db_direct.available():
        return {}
    import psycopg

    with psycopg.connect(db_direct._dsn()) as conn, conn.cursor() as cur:
        cur.execute(
            "select series_id, date, value from macro where series_id = any(%s)",
            (list(series_ids),),
        )
        out: dict[str, dict[str, float]] = {}
        for sid, d, v in cur.fetchall():
            out.setdefault(sid, {})[str(d)] = float(v)
    return out


def vix_condition(s: list[MarketDay], as_of: str) -> dict | None:
    """'어젯밤 VIX 상승' 조건 — 오늘 성립 여부 + 과거 빈도. 미성립/데이터부족이면 None.

    과거 이력은 FRED+네이버를 합쳐 쓴다(같은 날은 네이버 우선). FRED 만으론 최근이
    비고, 네이버만으론 이력이 짧다.
    """
    m = _load_macro(("VIXCLS", "VIX_NAVER"))
    merged = {**m.get("VIXCLS", {}), **m.get("VIX_NAVER", {})}
    if len(merged) < 60:
        return None
    vd = sorted(merged)
    mkt = {d.date: d for d in s}
    mkt_days = sorted(mkt)

    def next_kr(after: str) -> str | None:
        for d in mkt_days:
            if d > after:
                return d
        return None

    # 과거 빈도 — VIX 가 오른 날의 '다음 한국 거래일' 수익률
    ups: list[float] = []
    for i in range(1, len(vd)):
        if merged[vd[i]] <= merged[vd[i - 1]]:
            continue
        nk = next_kr(vd[i])
        if nk and nk <= as_of:
            ups.append(mkt[nk].ret)
    if len(ups) < MIN_SAMPLE:
        return None

    # 오늘 성립? — as_of 이하 최신 두 값 비교
    recent = [d for d in vd if d <= as_of]
    if len(recent) < 2 or merged[recent[-1]] <= merged[recent[-2]]:
        return None

    return {
        "condition": MACRO_CONDITIONS["VIX"][0],
        "n": len(ups),
        "up_rate_1d": round(sum(1 for x in ups if x > 0) / len(ups), 4),
        "avg_ret_1d": round(sum(ups) / len(ups), 6),
        "detail": {
            "series": "VIX", "date": recent[-1],
            "value": round(merged[recent[-1]], 2),
            "prev": round(merged[recent[-2]], 2),
        },
    }


def _forward(s: list[MarketDay], i: int, h: int) -> float | None:
    if i + h >= len(s):
        return None
    acc = 1.0
    for k in range(i + 1, i + 1 + h):
        acc *= 1 + s[k].ret
    return acc - 1


def baseline(s: list[MarketDay], horizons=(1, 5)) -> dict:
    """조건 없이 '오른다'고 했을 때의 적중률 — 모든 조건은 이걸 이겨야 의미가 있다."""
    out = {"n": len(s)}
    for h in horizons:
        fw = [x for i in range(len(s)) if (x := _forward(s, i, h)) is not None]
        out[f"up_rate_{h}d"] = round(sum(1 for x in fw if x > 0) / len(fw), 4) if fw else None
        out[f"avg_ret_{h}d"] = round(sum(fw) / len(fw), 6) if fw else None
    return out


def measure(s: list[MarketDay], label: str, fn, horizons=(1, 5)) -> dict | None:
    """한 조건의 과거 빈도. 표본 부족(MIN_SAMPLE 미만)이면 None — 발행하지 않는다."""
    idx = [i for i in range(len(s)) if fn(s, i)]
    if len(idx) < MIN_SAMPLE:
        return None
    rec = {"condition": label, "n": len(idx)}
    for h in horizons:
        fw = [x for i in idx if (x := _forward(s, i, h)) is not None]
        if not fw:
            continue
        rec[f"up_rate_{h}d"] = round(sum(1 for x in fw if x > 0) / len(fw), 4)
        rec[f"avg_ret_{h}d"] = round(sum(fw) / len(fw), 6)
    return rec


def build(as_of: str | None = None) -> dict | None:
    """오늘 성립한 조건 + 각 조건의 과거 빈도 + 기준선. 데이터 없으면 None."""
    s = load_series()
    if len(s) < 60:
        log.warning("breadth.insufficient", days=len(s))
        return None
    if as_of:                       # 과거 재현 — as_of 이후 봉은 안 본다
        s = [d for d in s if d.date <= as_of]
        if len(s) < 60:
            return None
    i = len(s) - 1
    today = s[i]
    active = []
    for label, fn in CONDITIONS.items():
        if not fn(s, i):
            continue
        m = measure(s, label, fn)
        if m:                        # 표본 미달 조건은 조용히 제외
            active.append(m)

    # 해외 변수 — 밤사이 일어난 일. 한국장 자기 이력만으론 이걸 못 본다.
    try:
        vix = vix_condition(s, today.date)
        if vix:
            active.append(vix)
    except Exception as e:  # noqa: BLE001 — 부가 정보라 실패해도 시황은 나간다
        log.warning("breadth.vix_failed", error=str(e)[:140])

    prev = s[i - 1] if i > 0 else None
    out = {
        "as_of": today.date,
        "market_ret": round(today.ret, 6),
        "breadth": round(today.breadth, 4),
        "advancers": today.up,
        "decliners": today.down,
        "unchanged": today.n - today.up - today.down,
        "instruments": today.n,
        "prev_breadth": round(prev.breadth, 4) if prev else None,
        "baseline": baseline(s),
        "conditions": active,
        "lookback_days": len(s),
    }
    log.info("breadth.built", as_of=today.date, breadth=out["breadth"],
             conditions=len(active), days=len(s))
    return out
