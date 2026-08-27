"""일일 발행 배치 — 리포트 발행 규정 v1 (2026-06-10 합의).

원칙: 사람이 고르지 않는다. 같은 기준을 통과한 종목은 같은 규칙으로 발행된다.

트랙:
  A(액션)    — 게이트 통과 셋업의 EOD(스윙·포지션) 매수 시그널 보유 종목. 매일 발행.
  B(커버리지) — 시총 상위 대표 종목(네이버 시총 순). 판정 변동 시에만 재발행.
  C(프리미엄) — 판정 '매수' 종목은 Opus 모델(runner 에서 자동 분담).

오늘의 포커스(daily picks):
  후보 = 매수 판정 ∪ (점수 상위 & 게이트 통과 플랜 보유) → 거래가능 게이트 통과
  → 점수순 상위 N. 기준 미달이면 0종목(빈 날 허용 — 억지로 채우지 않음).
  recommendations(basket_type='daily_focus') 적재, 매일 as_of 로 스냅샷 보존.
"""
from __future__ import annotations

from datetime import date, timedelta

from engine.backtest.event_backtest import _TIMEOUT_BARS
from engine.db import get_client, select_all, upsert
from engine.timeutil import kst_today
from engine.logging import get_logger
from engine.reports.context import EOD_STYLES, backtest_passed
from engine.reports.runner import publish_indepth
from engine.signals.levels import MAX_POSITION_PCT, compute_levels, min_risk_floor

log = get_logger(__name__)

DAILY_CAP = 100            # 일 발행 상한 (비용 가드레일)
COVERAGE_TOP = 50          # 트랙 B — 시총 상위 N
COVERAGE_SKIP_DAYS = 3     # 트랙 B — 판정 동일 시 재발행 생략 기간
PICKS_MAX = 5              # 오늘의 포커스 최대 종목 수
PICKS_MAX_PER_SECTOR = 2   # 한 섹터에서 뽑을 수 있는 픽 상한 (집중 리스크 분산)
# 진입가가 현재 종가에서 이 비율을 넘게 벗어나면 '실행 불가능(낡은 시그널)'으로 픽 제외.
# 시그널은 valid_until 까지 살아 upsert 로 갱신만 되는데, 며칠 전 발생한 시그널이 그때
# 진입가 그대로 '오늘의 포커스'에 재등장하면(현재가와 6~18% 괴리) 다음날 그 가격 진입이
# 불가능하다(2026-06-19 사고의 2차 원인). 신선한 시그널은 entry≈현재종가라 안 걸린다.
PICKS_MAX_ENTRY_DRIFT = 0.05
# 픽 손익비 하한. 1.0 미만은 "맞아도 손해"라 추천으로 내보내지 않는다.
# 2026-08-14 발행 NHN 이 손익비 0.4(-47.4% 손절 / +19.9% 목표)로 추천에 올랐다.
# 전수 점검(999건) 기준 손익비 1.0 미만은 7.6%, 중앙값은 3.72 라 하한 1.0 의
# 발행량 영향은 작다. 근본 원인(구조 손절 무제한)은 signals/levels.py 에서 고쳤고
# 이건 그 안전망이다.
PICKS_MIN_RR = 1.0

# 픽 손절폭 상한. 손익비만으론 부족하다 — 손절 -40%·목표 +45% 는 손익비 1.1 로
# 통과하지만 한 번 틀리면 원금의 40%가 날아간다. 손익비는 비율만 보고 절대 크기를
# 안 본다.
# levels.py 의 구조 손절 상한(1.5×ATR)이 근본 대책이지만 그건 ATR 상대값이라
# 종목별로 -30% 가 나올 수 있다. 여기서 절대 상한을 한 번 더 건다.
# 기준 -20% 근거: 전수 점검 999건에서 손절 -20% 초과는 82건(8.2%)이었고, 그
# 구간이 "손절이 아니라 방치"로 판정된 구간이다(levels.py 주석).
PICKS_MAX_STOP_PCT = 0.20

# 이미 열려 있는 픽과 같은 종목은 다시 발행하지 않는다.
# 2026-08-16 전수 점검: 111건 중 31건이 동일 플랜(같은 종목·진입·손절·목표) 재발행.
# 픽 선정은 매일 후보를 새로 뽑는데 진입가가 아직 살아 있으면(_entry_actionable)
# 어제 낸 그 플랜이 오늘도 상위에 들어 새 행으로 또 쌓인다. 인바디 48,000 플랜은
# 5행이 되어 -5.09% 손절이 5번 집계됐다.
# 더 나쁜 건 판정 불일치다 — resolve_pick_status 는 as_of 다음 봉부터 따라가므로
# 늦게 실린 행은 앞선 행이 이미 맞은 손절을 건너뛴다. 한국알콜 13,580 동일 플랜
# 4행 중 3행 손절(-4.55%)·1행 익절(+7.73%). 같은 계획인데 발행일만 다르면 성적이
# 갈리는 건 트랙레코드가 아니다.
# 실전에서도 같다 — 이미 들고 있는 종목을 매일 다시 사라고 할 순 없다.
SUPPRESS_REPUBLISH_WHILE_OPEN = True

# 매수 판정이 아니어도 픽 후보가 되는 점수 하한.
# 60 → 50 완화(2026-06-11): 판정 체계(매수≥65/중립≥45)에서 50은 "중립 상위".
# 60 기준으론 하루 후보가 1~2개라 포커스 5슬롯이 비어 다님 — 50이면 거래가능+
# 플랜 보유 중립 상위까지 후보가 되어 대체로 5개가 채워진다. 하한 자체는 유지:
# 후보 부족일엔 여전히 5개 미만/빈 날 허용(품질 우선, 억지로 채우지 않음).
PICKS_MIN_SCORE = 50.0

# 픽(오늘의 포커스)에서 제외할 셋업 — 시그널·리포트로는 유지하되 '매수 픽'으로는 안 씀.
# factor_composite: 횡단면 게이트 한계(상위 10% 초과수익 t≈-0.04, IC만 유효) + 라이브 픽
# 승률 12.5%(8건)·기여 최저 → 매수 신호가 아니라 '하위 제외 필터' 성격(pick-track-quality).
# 같은 종목이 다른 통과 셋업으로도 잡히면 그쪽으로 선정된다.
PICK_EXCLUDED_SETUPS = frozenset({"factor_composite"})

# risk_off 국면에서 픽으로 안 쓸 추세·돌파·모멘텀 셋업 — 하락장에서 실패.
# 검증(2026-06-19): 닫힌 픽 11건 전량이 risk_off(시장 20일 -7.9%)에서 발행돼 평균 -2.85%.
# 하락장에선 이 계열 픽을 억제(빈 날 허용)해 드로다운을 막는다. 수급(flow_accumulation)은
# 덜 추세추종적이라 전 국면 허용. (pick-track-quality)
# 통계 셋업(luckybot 이식, 2026-06-24)도 분류: 추세·모멘텀형은 억제,
# 평균회귀(sigma·quantile)는 역추세라 oversold_bounce 처럼 risk_off 허용(목록 제외).
TREND_PICK_SETUPS = frozenset(
    {"high_52w", "breakout", "vol_squeeze", "leader_trend", "pullback",
     "kalman", "median", "pivot", "sortino", "bayes", "ensemble",
     "delta", "markov"}
)
# 통계적 평균회귀 — 횡보(range)에서만 통하고 추세장에선 실패(2026-06-24 검증: 하락추세
# 워크포워드 탈락). 4국면 라우팅으로 range 에서만 픽 허용.
RANGE_SETUPS = frozenset({"sigma", "quantile"})
# 투매 반등(역추세) — 하락추세·횡보의 과대낙폭에서 작동.
# capitulation 추가(2026-07-31): 하락 국면에서 발행 가능한 검증 셋업이 anchor_pullback
# 하나뿐이라 픽 0건인 날이 반복됐다(07-21·22·23·31). 게이트 통과(swing, 기대값 +0.241R).
COUNTERTREND_SETUPS = frozenset({"oversold_bounce", "double_bottom", "capitulation"})

# 하락추세에서만 억제. 국면별 실측(2026-08-01, 전 종목 백테스트를 진입일 국면으로 분해)에서
# 하락장 기대값이 명확히 음(-)인 셋업 — 상승·횡보에선 양(+)이라 그 국면까지 막을 근거는 없다.
#   anchor_pullback/swing  상승 +0.149 · 횡보 +0.125 · 하락 -0.262
# 이 셋업은 종목 자체의 상승추세(MA20>MA60)를 요구하는 추세 계열인데도 TREND_PICK_SETUPS
# 에 없어 하락장에서 유일하게 허용됐다 — 즉 하락장에서 가장 나쁜 것만 통과시키고 있었다.
DOWNTREND_BLOCKED_SETUPS = frozenset({"anchor_pullback"})

# 횡보(range)에서 발행을 «허용»하는 (셋업 × 기간) 목록. 차단 목록이 아니라 허용 목록이다.
#
# 왜 뒤집었나 (2026-08-22) — 기존 규칙은 "횡보 = 평균회귀"라는 교과서 매핑이었고,
# 그 결과 8/21(국면 range)에 리포트 플랜 588건이 전부 잘려 **발행 0건**이 됐다.
# 게이트를 통과한 셋업은 전부 추세·역추세 계열이라 차단됐고, 횡보에 허용돼 있던
# 평균회귀(sigma·quantile)는 게이트를 통과한 적이 없었다. 즉 횡보인 날은 구조적으로
# 영구 빈 날이었다.
#
# 그래서 이름(추세/역추세/평균회귀)으로 나누던 것을 그만두고 **측정된 조합만 연다**.
# 근거는 429거래일을 기간 축으로 분해한 실측(scripts/diag_regime_expectancy --axis horizon).
# 조건 셋을 모두 만족하는 것만 넣었다: ①게이트 통과 ②횡보 기대값 양수 ③**최근 구간도**
# 양수 ④표본이 해석 가능.
#
#                        횡보 기대값        최근 구간
#     capitulation 단기   +0.098( 111)    +0.322( 361)
#     capitulation 중기   +0.086( 100)    +0.115( 345)
#     double_bottom 단기  +0.130( 204)    +0.395(  71)
#     double_bottom 중기  +0.352( 175)    +0.299(  65)
#     oversold_bounce 단기 +0.834(  29)   +0.605( 180)
#
# ⚠️ 최근 구간을 따로 보지 않으면 정반대 결론이 나온다. quantile 은 횡보 전체가
#    +0.543/+1.162/+1.337 로 가장 좋아 보이는데 최근 구간이 -0.509/-0.727/-0.658 이다.
#    예전 median 사고(+0.489 → -0.403)와 같은 패턴이라 넣지 않았다.
# ⚠️ sigma 도 뺐다 — 지금 횡보에 허용돼 있지만 횡보 -0.078(20건)·최근 -0.637 이다.
#    «허용돼 있으나 마나»가 아니라 «있으면 손해»였다.
# ⚠️ flow_accumulation 은 전 국면 허용이었는데 횡보에서는 빠진다. 단기만 횡보 +0.441
#    인데 최근 구간이 +0.017 로 사실상 0 이고, 중기·장기는 둘 다 음수다.
# ⚠️ 기간이 다르면 다른 거래다. 같은 oversold_bounce 라도 스타일 축(swing)으로 재면
#    횡보 -0.305 였는데 단기 프로파일(5일 보유·본전스톱)에서는 +0.834 다.
RANGE_ALLOWED_COMBOS: frozenset[tuple[str, str]] = frozenset({
    ("capitulation", "short"),
    ("capitulation", "mid"),
    ("double_bottom", "short"),
    ("double_bottom", "mid"),
    ("oversold_bounce", "short"),
})


def _pick_suppressed(
    setup: str | None, market_state: str | None, risk_off: bool,
    horizon: str | None = None,
) -> bool:
    """국면별 픽 억제 판정 — 3국면(market_state) 라우팅.

    상승추세=추세추종 / 하락추세=역추세·수급 / **횡보=측정된 조합만**(아래).
    market_state 미상이면 구 risk_off 로직(하위호환) — 이 폴백은 «레짐 행이 아직 없는
    날»을 위한 것이지 축 부재와는 무관하다.

    horizon: 횡보 판정에만 쓴다. 횡보는 셋업이 아니라 **(셋업 × 기간)** 단위로 연다 —
      같은 셋업도 기간에 따라 부호가 갈리기 때문이다(RANGE_ALLOWED_COMBOS 주석 참조).
      기간이 없는 옛 플랜은 어느 조합인지 특정할 수 없으므로 횡보에서 발행하지 않는다.

    ⚠️ 상승·하락 라우팅은 아직 셋업 이름 기준이다. 하락은 실측이 있고(2026-08-01),
      상승은 아직 없다 — 다음 순서다.
    """
    if market_state is None:
        return bool(
            risk_off
            and (setup in TREND_PICK_SETUPS or setup in DOWNTREND_BLOCKED_SETUPS)
        )
    if market_state == "uptrend":
        return setup in RANGE_SETUPS                      # 상승추세 — 평균회귀만 제외
    if market_state == "downtrend":
        return (
            setup in TREND_PICK_SETUPS
            or setup in RANGE_SETUPS
            or setup in DOWNTREND_BLOCKED_SETUPS          # 역추세·수급만
        )
    # range — 측정된 (셋업 × 기간)만 연다. 이름으로 나누지 않는다.
    # «전환» 국면은 2026-08-22 에 없앴다(ER 축 제거, engine/market/regime 참조).
    # 그런 값을 가진 행은 DB 에도 없었다.
    return (setup or "", horizon or "") not in RANGE_ALLOWED_COMBOS


def passed_setups_from_db() -> set[str]:
    """backtests 최신 행 기준 게이트 통과 셋업 집합 (재백테스트 없이 read).

    매트릭스(셋업×스타일) 이후: 어떤 스타일로든 통과하면 그 셋업 포함(셋업 단위 소비처용).

    ⚠️ 스타일 없는 옛 행에 구조된 셋업을 걸러낸다. 2026-06-13 이전에는 스타일 구분이
    없어 style=NULL 로 적재됐는데, 그 행이 (setup, "") 라는 별도 키로 살아남아 **지금
    모든 스타일에서 탈락한 셋업을 통과로 만들고 있었다**(leader_trend·pullback — 둘 다
    현재 position·swing 전부 FAIL 인데 두 달 전 행 덕에 트랙 A 리포트가 계속 나갔다).
    메모리의 '61커밋 뒤처진 배포가 6주간 추세픽을 통과시킨' 사고와 같은 종류다.

    그렇다고 style 없는 행을 통째로 버릴 수는 없다 — factor_composite 는 횡단면 전략이라
    원래 스타일이 없다(cross_section.py). 그래서 **스타일별 판정이 하나라도 있는 셋업은
    그것만 보고, 아예 없는 셋업만 스타일 없는 행으로 폴백**한다.
    """
    latest: dict[tuple[str, str], dict] = {}
    for bt in sorted(
        select_all("backtests",
                   "setup,style,horizon,win_rate,avg_rr,mdd,expectancy_r,passed,"
                   "created_at"),
        key=lambda b: b.get("created_at") or "",
    ):
        if bt.get("setup"):
            latest[(bt["setup"], bt.get("horizon") or bt.get("style") or "")] = bt
    from engine.backtest.runner import drop_superseded_style_rows
    return passed_setups_from_rows(drop_superseded_style_rows(latest))


def passed_setups_from_rows(latest: dict[tuple[str, str], dict]) -> set[str]:
    """{(setup, style): 백테스트행} → 통과 셋업 집합. (순수 함수)

    스타일별 판정이 있는 셋업은 스타일 없는 옛 행을 무시한다(위 docstring 참조).
    """
    # 기간 축 행은 style 이 비어 있고 horizon 에 값이 있다 — 키에 이미 축 값이
    # 들어와 있으므로 «스타일 없는 옛 행» 규칙과 섞이지 않는다.
    has_style = {setup for (setup, style) in latest if style}
    out: set[str] = set()
    for (setup, style), bt in latest.items():
        if setup in has_style and not style:
            continue                       # 매트릭스 이전 행 — 이미 대체됐다
        if backtest_passed(bt):
            out.add(setup)
    return out


def gate_expectancy_from_db(as_of: str | None = None) -> dict[tuple[str, str], float]:
    """backtests 최신 행 기준 (setup,style)→expectancy_r — 복수 통과 스타일 중 선택용.

    as_of: 주면 그 날 이전 적재분만 — 과거일 백필의 시점 정합성(passed_combos_from_db 참조).
    """
    from engine.backtest.runner import (
        _within, drop_superseded_style_rows, gate_cutoff,
    )
    cutoff = gate_cutoff(as_of)
    latest: dict[tuple[str, str], dict] = {}
    for bt in sorted(
        select_all("backtests", "setup,style,horizon,expectancy_r,created_at"),
        key=lambda b: b.get("created_at") or "",
    ):
        axis = bt.get("horizon") or bt.get("style")
        if bt.get("setup") and axis and _within(bt, cutoff):
            latest[(bt["setup"], axis)] = bt
    latest = drop_superseded_style_rows(latest)
    return {
        k: float(bt["expectancy_r"])
        for k, bt in latest.items()
        if bt.get("expectancy_r") is not None
    }


def setup_priority_from_db() -> dict[str, float]:
    """셋업 → 최신 백테스트 기대값(R). 셋업 간 «누가 더 나은가»의 유일한 공통 자다.

    라운드로빈이 상한에서 잘릴 때 남는 자리를 어느 셋업에 줄지 정하는 데 쓴다.
    없으면 0.0 — 알파벳 순으로 밀리지 않도록 동점 처리만 한다.
    """
    best: dict[str, float] = {}
    for bt in select_all("backtests", "setup,expectancy_r,passed,created_at"):
        st = bt.get("setup")
        if not st or not bt.get("passed"):
            continue
        e = bt.get("expectancy_r")
        if e is None:
            continue
        best[st] = max(best.get(st, float("-inf")), float(e))
    return best


def _load_track_a_signals(passed: set[str]) -> list[dict]:
    """게이트 통과 셋업의 EOD 매수 시그널 **전량** (페이지네이션).

    ⚠️ 필터를 DB 에서 건다. 예전에는 `.limit(2000)` 로 강도 상위만 받아 파이썬에서
    걸렀는데 두 가지가 겹쳐 조용히 망가져 있었다(2026-08-20 실측):

      ① PostgREST 기본 응답 상한이 1000 이라 2000 을 요청해도 1000행만 온다.
      ② 그 1000행은 강도 내림차순이라 최저 강도가 0.800 이었고, 절반 이상이
         게이트를 «통과하지 못한» 셋업이었다(leader_trend 278·bayes 64·markov 59…).
         게이트 필터가 그 뒤 파이썬에서 걸리므로, 강도 낮은 통과 셋업은
         파이썬에 도달조차 못 했다.

    그 결과 통과 9셋업 중 6셋업(flow_accumulation·vol_squeeze·pivot·anchor_pullback·
    double_bottom·capitulation)이 후보 0건이었다. double_bottom 은 기대값 +0.489R 로
    전 셋업 1위인데 강도 0.600 이라 두 건 모두 잘렸다.

    동점 정렬 안정화를 위해 id 를 2차 키로 둔다 — 강도 0.600 이 수백 건이라
    2차 키가 없으면 페이지 경계에서 행이 중복되거나 누락된다.
    """
    if not passed:
        return []
    client = get_client()
    out: list[dict] = []
    start, page = 0, 1000
    while True:
        res = (
            client.table("signals")
            .select("id,setup,style,strength,instruments(symbol,active)")
            .eq("signal_type", "buy")
            .in_("setup", sorted(passed))
            .in_("style", list(EOD_STYLES))
            .order("strength", desc=True).order("id")
            .range(start, start + page - 1).execute()
        ).data or []
        out.extend(res)
        if len(res) < page:
            break
        start += page
    log.info("reports.track_a.signals", rows=len(out), setups=len(passed))
    return out


def track_a_symbols(passed: set[str]) -> list[str]:
    """트랙 A — 게이트 통과 셋업의 EOD 매수 시그널 보유 종목.

    ⚠️ **셋업별 라운드로빈**이다. 전역 강도순이 아니다(2026-08-20 변경).

    왜: strength 는 셋업 «안에서» 계산된 상대값이라 셋업끼리 비교할 수 없다.
    markov 는 신호가 나면 무조건 1.000, median·pivot 은 무조건 0.600 을 준다.
    한 줄로 세워 상위 100 을 자르면 markov 59건이 통째로 들어가고 median 433건은
    전부 탈락한다 — 실제로 2026-08-20 발행 100건이 markov·ensemble·sortino
    세 셋업으로만 채워졌고, 게이트를 통과한 나머지 8조합은 리포트가 0건이었다.
    게이트가 13개를 통과시켰는데 발행은 3개만 하는, 게이트가 무력화된 상태였다.
    (double_bottom:position 은 기대값 +0.489R 로 1위인데 강도 0.600 이라 잘렸다)

    각 셋업의 1등 → 각 셋업의 2등 → … 순으로 섞는다. 후보가 2건뿐인 셋업은
    2바퀴만 기여하고 빠지므로, 큰 셋업이 남은 자리를 자연히 채운다.
    같은 바퀴 안의 순서는 백테스트 기대값이 높은 셋업부터 — 상한에서 잘릴 때
    남는 한 자리가 더 나은 셋업에 가도록.
    """
    rows = _load_track_a_signals(passed)

    by_setup: dict[str, list[str]] = {}
    seen_per_setup: dict[str, set[str]] = {}
    for r in rows:                                   # 이미 강도 내림차순
        inst = r.get("instruments") or {}
        sym = inst.get("symbol")
        setup = r.get("setup")
        if not (setup in passed and r.get("style") in EOD_STYLES
                and inst.get("active") and sym):
            continue
        seen = seen_per_setup.setdefault(setup, set())
        if sym in seen:                              # 같은 셋업 내 중복 스타일
            continue
        seen.add(sym)
        by_setup.setdefault(setup, []).append(sym)

    if not by_setup:
        return []
    prio = setup_priority_from_db()
    order = sorted(by_setup, key=lambda st: (-prio.get(st, 0.0), st))

    out: list[str] = []
    picked: set[str] = set()
    depth = 0
    longest = max(len(v) for v in by_setup.values())
    while depth < longest:
        for setup in order:
            lst = by_setup[setup]
            if depth < len(lst) and lst[depth] not in picked:
                picked.add(lst[depth])
                out.append(lst[depth])
        depth += 1
    return out


def track_b_symbols(top: int = COVERAGE_TOP) -> list[str]:
    """트랙 B — 시총 상위 대표 종목(네이버 시총 정렬 목록 활용, KOSPI 위주)."""
    from engine.ingest.universe import fetch_market_codes

    kospi = [it["symbol"] for it in fetch_market_codes("KOSPI")][: int(top * 0.7)]
    kosdaq = [it["symbol"] for it in fetch_market_codes("KOSDAQ")][: top - len(kospi)]
    candidates = kospi + kosdaq
    # instruments 에 존재 + 활성인 것만
    active = {
        r["symbol"]
        for r in select_all("instruments", "symbol,active", eq={"active": True})
    }
    return [s for s in candidates if s in active]


def _plan_gate_ok(row: dict, passed_combos: dict[str, list[str]] | None) -> bool:
    """플랜 1행의 (setup, style)이 백테스트 게이트를 통과했는가.

    passed_combos=None 이면 게이트 미적용(테스트·하위호환). 운영 호출은 항상 주입한다.
    엣지가 검증된 조합만 발행 → 적자 슬라이스(예: 게이트 탈락 swing) 차단.
    """
    if passed_combos is None:
        return True
    # 축이 «기간»으로 바뀌었다(2026-08-22). 플랜에 horizon 이 있으면 그걸로 대조하고,
    # 없는 옛 리포트는 style 로 폴백한다 — 전환 중 두 세대가 섞여도 조용히 틀리지 않게.
    axis = row.get("horizon") or row.get("style")
    return axis in passed_combos.get(row.get("setup") or "", [])


def tradable_now(payload: dict | None) -> bool:
    """리포트의 «거래 가능» 판정에서 **종목 성질만** 본다. (순수 함수)

    tradability.checks 에는 backtest_gate 항목이 들어 있는데, 그건 리포트를 만든 날의
    게이트를 얼려 놓은 값이다. 게이트가 바뀌면 그 값이 지금과 어긋난다 —
    2026-08-21 실측: 리포트에는 통과 셋업이 ["breakout","ensemble","pivot",...] 로
    박혀 있는데 지금은 셋 다 통과하지 못하고, 반대로 새로 통과한 double_bottom 을 가진
    종목은 «통과 셋업 없음 → 거래 부적합» 으로 찍혀 있었다.

    조합 검증은 _plan_gate_ok 가 플랜 한 줄씩 한다 — 그쪽이 더 정확하다(셋업 단위가
    아니라 셋업 × 기간 단위). 그래서 여기서는 유니버스·유동성·변동성만 본다.
    """
    checks = ((payload or {}).get("tradability") or {}).get("checks") or []
    if not checks:
        return bool(((payload or {}).get("tradability") or {}).get("passed", False))
    # blocking 플래그가 있으면 그걸 따르고(2026-08-23 이후 리포트), 없는 옛 리포트는
    # 키 이름으로 판정한다 — 두 세대가 섞여도 같은 결론이 나오게.
    return all(
        c.get("passed")
        for c in checks
        if c.get("blocking", c.get("key") != "backtest_gate")
    )


def _rr_ok(row: dict, min_rr: float = PICKS_MIN_RR) -> bool:
    """손익비 하한. 손익비 미상이면 통과(과도 차단 안 함) — 값이 있을 때만 거른다."""
    rr = row.get("risk_reward")
    if rr in (None, 0):
        return True
    return float(rr) >= min_rr


def _stop_width_ok(row: dict, max_pct: float = PICKS_MAX_STOP_PCT) -> bool:
    """손절폭 절대 상한. 진입가·손절가 중 하나라도 없으면 통과(값 있을 때만 거른다).

    손익비(_rr_ok)와 다른 축이다 — 손익비는 비율만, 이건 한 번 틀렸을 때의 절대
    손실 크기를 본다. 손절 -40%/목표 +45% 는 손익비 1.1 로 통과하지만 발행하면 안 된다.
    """
    entry, stop = row.get("entry_price"), row.get("stop_loss")
    if entry in (None, 0) or stop is None:
        return True
    return abs(float(entry) - float(stop)) / float(entry) <= max_pct


def _entry_actionable(row: dict, close: float | None, max_drift: float) -> bool:
    """플랜 진입가가 현재 종가에서 max_drift 안쪽인가 (낡은 시그널 배제).

    close 미상 또는 진입가 결손이면 검증하지 않음(True) — 신선도 가드가 별도로
    데이터 신선도를 보장하므로 과도 차단 안 함. 신선 시그널은 entry≈close 라 통과.
    """
    close = None if close in (None, 0) else float(close)
    entry = row.get("entry_price")
    if close is None or entry in (None, 0):
        return True
    return abs(float(entry) / close - 1) <= max_drift


def _best_plan(
    plan: list[dict], expectancy_by_combo: dict[tuple[str, str], float] | None
) -> dict:
    """한 종목이 복수 스타일로 통과했을 때 발행할 플랜 1개 선택.

    검증 기대값(expectancy_r) 높은 (setup,style) 우선 — "어떤 스타일이 맞나"를
    시그널 강도가 아닌 백테스트 성과로 결정. 미주입·동률이면 강도(strength) 폴백.
    """
    def key(row: dict) -> tuple[float, float]:
        exp = None
        if expectancy_by_combo is not None:
            exp = expectancy_by_combo.get(
                (row.get("setup"), row.get("horizon") or row.get("style")))
        return (
            exp if exp is not None else float("-inf"),
            float(row.get("strength") or 0),
        )

    return max(plan, key=key)


def select_picks(reports: list[dict], *, max_picks: int = PICKS_MAX,
                 min_score: float = PICKS_MIN_SCORE,
                 passed_combos: dict[str, list[str]] | None = None,
                 expectancy_by_combo: dict[tuple[str, str], float] | None = None,
                 regime: str | None = None,
                 market_state: str | None = None,
                 sector_by_id: dict[int, str | None] | None = None,
                 max_per_sector: int = PICKS_MAX_PER_SECTOR,
                 close_by_id: dict[int, float | None] | None = None,
                 max_entry_drift: float = PICKS_MAX_ENTRY_DRIFT,
                 blocking: list[dict] | None = None,
                 open_book: dict | None = None,
                 open_instrument_ids: set[int] | None = None,
                 ) -> list[dict]:
    """오늘의 포커스 선정 — 순수 함수. reports: 그날 발행 리포트 행(payload 포함).

    passed_combos: {setup: [통과 스타일]} — 주입 시 게이트 통과 (setup,style) 플랜만 발행.
    expectancy_by_combo: {(setup,style): expectancy_r} — 복수 통과 시 기대값 높은 스타일 선택.
    regime: 발행일 시장 국면('risk_off' 면 추세·돌파 픽 억제 — 하락장 손실 회피).
    sector_by_id: {instrument_id: 섹터} — 주입 시 한 섹터당 max_per_sector 로 픽을
      제한(집중 리스크 분산). 섹터 미상(null/'ALL')은 제약 없음 → 섹터 데이터가
      없으면 기존(점수 상위 N)과 동일 동작(graceful). 미주입(기본)이면 상한 미적용.
    close_by_id: {instrument_id: 최신 종가} — 주입 시 진입가가 현재가에서 max_entry_drift
      넘게 벗어난 플랜(낡은 시그널)을 제외. 종가 미상은 검증 안 함(graceful).
    blocking: 그날 신규 진입을 막는 캘린더 이벤트(engine.market.calendar.blocking_events).
    open_book: 진행 중 픽이 이미 쓰고 있는 예산({count,risk_pct,exposure_pct}).
      주입하면 포트폴리오 상한(MAX_PORTFOLIO_*) 안에서만 새 픽을 낸다. 미주입이면
      제약 없음(테스트·하위호환) — 운영 호출은 항상 준다.
      시장 전체 이벤트(instrument_id 없음)면 그날은 빈 날, 종목 이벤트면 그 종목만 제외.
    open_instrument_ids: 그 시점에 이미 열려 있는 픽의 종목 — 재발행 중복 방지
      (SUPPRESS_REPUBLISH_WHILE_OPEN 주석 참조). 미주입이면 억제 안 함(하위호환).
    기준 미달이면 빈 리스트(빈 날 허용).
    """
    # 캘린더 억제 — 알려진 변동성 구간(동시만기 등)에는 신규 진입을 내지 않는다.
    # 보유 픽 청산은 manage_picks 가 따로 처리하므로 여기서 막아도 출구는 안 막힌다.
    market_block = [e for e in (blocking or []) if e.get("instrument_id") is None]
    if market_block:
        log.info("reports.daily.picks.calendar_blocked",
                 events=[e.get("title") for e in market_block])
        return []
    blocked_ids = {e["instrument_id"] for e in (blocking or [])
                   if e.get("instrument_id") is not None}

    # 이미 보유(=열린 픽) 중인 종목은 후보에서 제외. 같은 거래를 매일 다시 세지 않는다.
    held_ids = set(open_instrument_ids or ()) if SUPPRESS_REPUBLISH_WHILE_OPEN else set()

    risk_off = regime == "risk_off"
    cands = []
    for r in reports:
        if r["instrument_id"] in blocked_ids or r["instrument_id"] in held_ids:
            continue
        p = r.get("payload") or {}
        verdict = p.get("verdict") or {}
        close = (close_by_id or {}).get(r["instrument_id"])
        score = float(verdict.get("score") or 0)
        rating = verdict.get("rating")
        # EOD 스타일 + 게이트 통과 플랜만 — 옛 payload(데이/종가베팅)나 엣지 미검증
        # 조합(게이트 탈락 swing 등)이 픽으로 새지 않게 선정 단에서 이중 방어.
        # + 진입가 실행가능성(낡은 시그널 제외).
        # 레짐 적응형 선택 — 하락장(risk_off)에선 추세·돌파 매수픽 억제(검증: 하락장
        # 추세픽 평균 -2.85%·라이브 0% 승률). 한국시장 숏 불가 → 하락장 수익은 역추세
        # (과대낙폭 반등)·수급(flow)으로. 적합한 게 없으면 빈 날(억지로 안 채움).
        plan = [
            row for row in (p.get("plan") or [])
            if row.get("style") in EOD_STYLES
            and row.get("setup") not in PICK_EXCLUDED_SETUPS
            and not _pick_suppressed(row.get("setup"), market_state, risk_off,
                                     row.get("horizon"))
            and _plan_gate_ok(row, passed_combos)
            and _entry_actionable(row, close, max_entry_drift)
            and _rr_ok(row)
            and _stop_width_ok(row)
        ]
        # 얼린 게이트 판정은 빼고 종목 성질만 본다 — 조합 검증은 _plan_gate_ok 가 한다.
        tradable = tradable_now(p)
        if not tradable or not plan:
            continue
        if rating != "매수" and score < min_score:
            continue
        # 종목 내 스타일 선택은 검증 기대값 우선, 종목 간 순위는 점수(score)로.
        cands.append((score, r, _best_plan(plan, expectancy_by_combo)))
    cands.sort(key=lambda t: t[0], reverse=True)

    # 섹터 집중 상한 — 점수순으로 뽑되 한 섹터가 max_per_sector 를 넘기면 건너뛰고
    # 다른 섹터의 차순위로 슬롯을 채운다(분산). 섹터 미상은 카운트에서 제외(무제약).
    sec_count: dict[str, int] = {}
    selected: list[tuple[float, dict, dict]] = []
    # 진행 중 픽이 이미 쓰고 있는 예산에서 출발한다 — 오늘 것만 세면 날마다 쌓인다.
    book = open_book or {}
    used_risk = float(book.get("risk_pct") or 0.0)
    used_expo = float(book.get("exposure_pct") or 0.0)
    used_cnt = int(book.get("count") or 0)
    budget_blocked = 0
    for cand in cands:
        if len(selected) >= max_picks:
            break
        sec = (sector_by_id or {}).get(cand[1]["instrument_id"])
        known = bool(sec) and sec != "ALL"
        if known and sec_count.get(sec, 0) >= max_per_sector:
            continue
        if open_book is not None:
            plan = cand[2]
            add_risk = account_risk_pct(plan.get("entry_price"), plan.get("stop_loss"))
            add_expo = position_size_pct(plan.get("entry_price"), plan.get("stop_loss"))
            if not fits_portfolio_budget(used_risk, used_expo, used_cnt,
                                         add_risk, add_expo):
                budget_blocked += 1
                continue          # 다음 후보로 — 더 작은 픽은 들어갈 수 있다
            used_risk += add_risk
            used_expo += add_expo
            used_cnt += 1
        selected.append(cand)
        if known:
            sec_count[sec] = sec_count.get(sec, 0) + 1
    if budget_blocked:
        log.info("picks.budget_blocked", blocked=budget_blocked,
                 used_risk=round(used_risk, 2), used_exposure=round(used_expo, 2),
                 used_count=used_cnt)

    picks = []
    for score, r, top_plan in selected:
        narrative = (r.get("payload") or {}).get("narrative") or {}
        picks.append({
            "basket_type": "daily_focus",
            "setup": top_plan.get("setup"),   # 실제 셋업 라벨(미적재 시 DB 기본값 오라벨 방지)
            "style": top_plan["style"],
            "instrument_id": r["instrument_id"],
            "weight": None,
            "conviction": round(min(score / 100.0, 1.0), 4),
            "thesis": narrative.get("thesis") or r.get("summary"),
            # ⚠️ 여기 값들은 «예상»이다. 진입은 다음 거래일 시가 시장가이고 그 시가는
            # 아직 모른다 — D+1 배치가 confirm_pending_picks 로 실제 시가를 넣고
            # 손절·목표를 그 시가 기준으로 다시 계산해 덮어쓴다.
            "entry_price": top_plan.get("entry_price"),
            "target_price": top_plan.get("tp1"),
            "tp2_price": top_plan.get("tp2"),   # 스케일아웃 잔량 런 목표(있으면 분할청산)
            "stop_loss": top_plan.get("stop_loss"),
            "as_of": r["as_of"],
            "horizon": top_plan.get("horizon"),
            "status": "pending",                # 진입 대기 — 시가 확정 전
            "entry_rule": ENTRY_RULE,
            "plan_payload": _plan_payload(top_plan),
        })
    return picks


# 캘린더 안전망 — 타임아웃은 스타일별 봉 수(_TIMEOUT_BARS)가 주(主). 거래정지/상장폐지로
# 봉이 안 쌓여 봉-타임아웃에 영영 못 닿는 픽만 이 날짜로 강제 만료(position 60봉≈84일보다 길게).
PICK_EXPIRE_DAYS = 120


# 진입 규칙 — 발행하는 픽은 «다음 거래일 시가 시장가»다(2026-08-21 전환).
# 게이트도 같은 가정(entry_mode="open")으로 평가한다. 둘이 어긋나면 게이트가
# 통과시킨 기대값이 라이브에서 성립하지 않는다 — 그게 직전까지의 문제였다.
ENTRY_RULE = "next_open"

# 진입 대기 상한(일). 다음 거래일 봉이 이 안에 안 오면(거래정지·상장폐지) 픽을
# 취소한다 — 안 그러면 pending 이 조용히 쌓이고, 열흘 지난 계획으로 진입하게 된다.
PENDING_MAX_DAYS = 10


def _plan_payload(plan: dict) -> dict:
    """픽에 실어 보낼 레벨 재계산 입력 + 발행 시 예상 레벨.

    예상값을 함께 남기는 이유: 확정가로 덮어쓰고 나면 "발행 때 뭐라고 했는지"를
    되짚을 수 없다. 갭이 컸던 날을 사후에 설명하려면 둘 다 있어야 한다.
    """
    return {
        "atr": plan.get("atr"),
        "support": plan.get("support"),
        "resistance": plan.get("resistance"),
        "risk_pct": PICK_RISK_PCT,
        "planned_entry": plan.get("entry_price"),
        "planned_stop": plan.get("stop_loss"),
        "planned_tp1": plan.get("tp1"),
        "planned_tp2": plan.get("tp2"),
    }


# 레벨 재계산 시 쓰는 1회 리스크 비율. position_size_pct 는 픽에 저장하지 않고
# 읽기 시점(웹 lib/position)에 계산하므로, 여기서는 재현성을 위한 기록값이다.
PICK_RISK_PCT = 1.0

# ── 포트폴리오 예산 (2026-08-22) ───────────────────────────────────────
# 지금까지 픽은 **서로의 존재를 모른 채** 사이징됐다. 거래 하나는 «손절 시 계좌 1%»로
# 맞는데, 그게 동시에 30건이면 동시 손절 시 -30% 다. 실측(2026-08-16)에서 동시 노출이
# 중앙 126% · 최대 396% 였다 — 현금으로 불가능한 4배 레버리지를 화면이 권하고 있었다.
#
# ⚠️ 장기(20일)를 쉬어도 안 풀린다. 오히려 구조상 더 커질 수 있다 —
#    하루 5건 × 중기 10일 보유 = 동시 50종목까지 쌓인다(옛 규칙은 30종목이 최대였다).
#    보유기간을 줄이는 것과 포트폴리오 상한은 다른 문제다.
#
# 그래서 발행 단에서 예산을 세운다. 셋 중 **먼저 닿는 것**이 그날 발행을 멈춘다.
MAX_PORTFOLIO_RISK_PCT = 10.0       # 동시 보유가 전부 손절될 때 계좌 손실 상한
MAX_PORTFOLIO_EXPOSURE_PCT = 100.0  # 비중 합 — 현금 계좌라 레버리지 없음
MAX_CONCURRENT_POSITIONS = 15       # 동시 보유 종목 수(관리 가능한 수)
# ⚠️ 실측(8월 픽 36건): 셋 중 **노출만 걸린다**. 노출 100% 는 8.5종목에서 차고,
#    그때 리스크는 6.65% · 종목수는 8.5 — 리스크 10% 와 종목수 15 는 도달하지 않는다.
#    두 상한은 «안전망» 이지 «목표» 가 아니다. 동시보유 종목수를 늘리려면 이 둘이
#    아니라 종목당 비중 상한(levels.MAX_POSITION_PCT)을 건드려야 한다.


def position_size_pct(entry: float | None, stop: float | None,
                      risk_pct: float = PICK_RISK_PCT,
                      max_pct: float = MAX_POSITION_PCT) -> float:
    """권장 계좌 비중(%) — 손절 시 손실이 계좌의 risk_pct% 가 되도록 역산. (순수)

    levels.compute_levels · 웹 lib/position 과 같은 공식이다. 픽 행에는 저장하지 않고
    필요할 때마다 진입가·손절가로 다시 구한다(단일 출처는 이 공식 자체다).
    """
    if not entry or not stop or entry <= 0:
        return 0.0
    dist = abs(entry - stop) / entry
    if dist <= 0:
        return 0.0
    return max(0.0, min(max_pct, risk_pct / dist))


def account_risk_pct(entry: float | None, stop: float | None,
                     risk_pct: float = PICK_RISK_PCT) -> float:
    """이 픽이 손절될 때 계좌가 잃는 비율(%). (순수)

    비중이 25% 상한에 걸리면 실제 리스크는 risk_pct 보다 **작아진다** — 그 경우까지
    1% 로 세면 예산을 과소평가한다. 그래서 비중에서 되짚어 계산한다.
    """
    if not entry or not stop or entry <= 0:
        return 0.0
    dist = abs(entry - stop) / entry
    return position_size_pct(entry, stop, risk_pct) * dist


def fits_portfolio_budget(
    used_risk: float, used_exposure: float, used_count: int,
    add_risk: float, add_exposure: float,
) -> bool:
    """이 픽을 더해도 포트폴리오 상한 안인가. (순수)"""
    return (
        used_count + 1 <= MAX_CONCURRENT_POSITIONS
        and used_risk + add_risk <= MAX_PORTFOLIO_RISK_PCT
        and used_exposure + add_exposure <= MAX_PORTFOLIO_EXPOSURE_PCT
    )


def _close_patch(status: str, today: date, exit_price: float,
                 ret: float | None, *, tp1_hit: bool | None = None) -> dict:
    patch = {
        "status": status,
        "closed_at": today.isoformat(),
        "exit_price": exit_price,
        "close_return_pct": round(ret, 4) if ret is not None else None,
    }
    if tp1_hit is not None:
        patch["tp1_hit"] = tp1_hit
    return patch


def _bar_lhc(bar: dict) -> tuple[float, float, float]:
    """일봉 한 개 → (저가, 고가, 종가)."""
    return float(bar["low"]), float(bar["high"]), float(bar["close"])


def _pre_trail(bar: dict, trail_from: str) -> bool:
    """본전스톱을 적용하면 «안 되는» 봉인가 — 전환이 일어난 봉과 그 이전.

    전환(목표 도달 → 손절을 본전으로)은 그 봉의 «고가»로 일어난다. 그 봉의 저가는
    전환보다 먼저 지나간 가격이므로 본전스톱에 걸릴 수 없다. 한 번의 실행 안에서는
    검사 순서(손절 → 목표)가 이걸 막지만, 전환이 DB 에 저장된 뒤 «다음» 배치가 같은
    봉을 다시 읽을 때는 막지 못한다 — 처음부터 본전스톱을 켠 채로 읽기 때문이다.

    2026-08-27 한전기술이 그렇게 닫혔다: 진입 봉(8/26)에 목표를 찍어 본전스톱으로
    전환됐는데, 다음 날 배치가 같은 봉의 저가(107,600 < 진입 110,200)로 본전 청산했다.
    그날 종가로 +14.6% 인 픽이 0% 무승부로 기록됐다.

    ts 가 없는 봉(단위 테스트의 합성 봉)은 판단하지 않는다 — 기존 동작 그대로.
    """
    ts = str(bar.get("ts") or "")[:10]
    return bool(trail_from and ts and ts <= trail_from)


# resolve_pick_status 가 «판정에 쓰는» 컬럼 전부. 여기서 하나라도 빠지면 판정이
# 조용히 달라진다 — 값이 None 이면 규칙이 그냥 꺼지기 때문이다.
#
# 2026-08-27 실제 사고: tp1_hit_at 이 빠져 있어 _pre_trail(전환 봉 가드)이 통째로
# 꺼졌고, 전환 «이전» 봉의 저가로 픽 2건이 본전(0%) 청산됐다. 실제로는 각각
# +10.5% · +16.4% 로 끝나야 했다. 테스트가 이 목록을 검사한다.
PICK_JUDGE_FIELDS: tuple[str, ...] = (
    "id", "as_of", "entry_price", "target_price", "tp2_price", "stop_loss",
    "tp1_hit", "tp1_hit_at", "style", "setup", "horizon", "instrument_id",
    "entry_rule", "confirmed_at",
)


def _trail_from(pick: dict) -> str:
    """이 픽이 «이미 전환된 채로» 들어왔다면 그 전환일(YYYY-MM-DD), 아니면 빈 문자열.

    이번 실행 안에서 전환되는 경우는 빈 문자열이다 — 그때는 검사 순서가 보호한다.
    """
    if not pick.get("tp1_hit"):
        return ""
    return str(pick.get("tp1_hit_at") or "")[:10]


def resolve_pick_status(
    pick: dict, bars: list[dict] | None, today: date
) -> dict | None:
    """열린 픽 1건의 상태 판정 (순수 함수). 변경 없으면 None.

    백테스트(event_backtest._exit_*)와 **동일 청산**으로 단일화 —
    진입(as_of) 다음 봉부터 따라가며 장중 터치 판정·**레벨 체결**:
      · 저가 ≤ 손절가  → 손절가에 청산 (손절 우선, 보수적)
      · 고가 ≥ 목표가  → 목표가에 청산
      · 스타일별 타임아웃(_TIMEOUT_BARS: swing 10·position 60봉) → 그 봉 종가 청산
    종가 오버슈트가 아니라 레벨 체결이라 실현 손익이 계획 R과 일치한다.

    분할익절(0022, tp2 있음): tp1 50% 익절 → 잔량 본전스톱 후 tp2 런.
      블렌디드 = 0.5·tp1수익 + 0.5·잔량수익. 같은 봉서 1·2차 동시 실현 불허(보수적).
    tp2 없는 옛 픽 / 진입가 결손은 단일 tp1 청산.

    ⚠️ **진입 체결을 먼저 확인한다**(2026-08-20 추가). 픽은 전일 종가를 진입가로 적어
    발행되므로, 다음 날 그 가격 «이하로 내려와야» 실제로 살 수 있다. 예전에는 이 확인
    없이 목표만 찍으면 승리로 셌다 — 아무도 못 산 승리가 성적표에 올랐다.

    실측(48건): 손절 픽은 24/24 체결됐는데 목표 픽은 1/3 만 체결됐다. 오르는 종목은
    갭업해 도망가고(목표 픽 다음날 시가 갭 평균 +6.4%), 내리는 종목만 진입가를 통과해
    체결된 뒤 손절까지 간다. 지정가 진입이 «좋은 픽만 걸러내는» 필터로 작동한 것이다.
    체결을 확인하면 승률이 11% → 4%(25건 중 1건)로 내려간다. 낮아진 게 아니라
    원래 그랬던 것을 이제 제대로 세는 것이다.

    체결 대기 기간은 픽 자신의 수명(타임아웃·만료)까지다 — 새 상수를 두지 않는다.
    끝까지 안 닿으면 'unfilled'(미체결) 로 닫는다. 거래가 없었으므로 손익도 없다(None).

    ⚠️ 남은 질문: 타임아웃을 as_of 부터 세는지 체결일부터 세는지. 지금은 as_of 기준
    (플랜에는 유통기한이 있다)이지만, 체결 기준이 맞다는 주장도 가능하다. 미결정.

    bars: as_of **다음** 거래일부터 오늘까지의 일봉 [{low,high,close}, ...] 오름차순.
    """
    if not bars:
        return None
    stop = pick.get("stop_loss")
    tp1 = pick.get("target_price")
    tp2 = pick.get("tp2_price")
    entry = pick.get("entry_price")
    e = float(entry) if entry not in (None, 0) else None
    s = float(stop) if stop is not None else None
    t1 = float(tp1) if tp1 is not None else None
    t2 = float(tp2) if tp2 is not None else None
    # 보유 상한 — 기간이 있으면 그 프로파일이 정한다(단기 5 / 중기 10 / 장기 20).
    # 없는 옛 픽만 스타일 타임아웃(swing 10 / position 60)으로 폴백한다.
    # ⚠️ 게이트가 그 기간으로 기대값을 쟀으므로 판정도 같은 기간이어야 한다.
    # 목표가에 닿았을 때 무엇을 하는가 — 기간 프로파일이 정한다(HorizonProfile.
    # target_action). 기간 없는 옛 픽만 "sell"(목표에서 판다)로 폴백한다.
    target_action = "sell"
    trail_r_mult = 1.0
    if pick.get("horizon"):
        from engine.signals.horizons import get_profile
        prof = get_profile(pick["horizon"], pick.get("setup"))
        timeout = prof.bars
        target_action = prof.target_action
        trail_r_mult = prof.trail_r_mult
    else:
        timeout = _TIMEOUT_BARS.get(pick.get("style"), 10)
    # 진입 규칙이 next_open 이면 시가 시장가라 «항상 체결»이다 — 체결 확인은 옛
    # limit 픽(전일 종가 지정가)에만 의미가 있다. 이때 bars 는 «진입 봉부터»
    # (manage_picks 가 confirmed_at 이상으로 잘라 준다) — 백테스트도 진입 봉부터
    # 청산을 추적하고 타임아웃도 그 봉부터 센다.
    next_open = str(pick.get("entry_rule") or "limit") == "next_open"
    as_of = date.fromisoformat(str(pick["as_of"]))
    cal_expired = (today - as_of).days >= PICK_EXPIRE_DAYS
    last_cl = _bar_lhc(bars[-1])[2]

    # ── 채택 규칙(target_action="trail") — 목표에서 팔지 않는다 ──
    #
    # 2026-08-22 실험(12개 비교에서 예외 없이 우세)으로 채택한 규칙인데, 이 함수가
    # 그걸 안 보고 있었다(2026-08-22 발견). 게이트·백테스트는 _exit_scalein 의 trail
    # 경로로 기대값을 쟀는데 라이브 판정은 아래 스케일아웃(tp1 에서 절반 익절)으로
    # 픽을 닫고 있었다 — **검증한 규칙과 실제 기록이 다른** 상태였다. 이 함수의
    # 독스트링이 "백테스트와 동일 청산으로 단일화"라고 적어 둔 그 약속을 지킨다.
    #
    # trail 에서는 tp2 를 쓰지 않는다(_exit_scalein 이 tp 를 하나만 받는다).
    #   손절 이탈        → 전량 청산 (stopped)
    #   목표 도달        → **팔지 않고** 손절을 진입가(본전)로 올린다. 안 닫는다.
    #   추격 이탈(전환 후) → 추격 청산 (trailed) — 고점에서 1R 되돌린 자리다
    #                        스톱이 평단이면 본전 청산(breakeven) — 무승부다
    #   기간 만료        → 그날 종가 전량 (expired)
    if target_action == "trail" and e is not None:
        # tp1_hit 은 여기서 «본전스톱으로 전환됨»을 뜻한다(1차 익절이 아니다).
        trailed = bool(pick.get("tp1_hit"))
        eff_stop = e if trailed else s
        filled = trailed or next_open
        trail_from = _trail_from(pick)
        # 되돌림 허용폭 — 고점에서 몇 R 아래에 스톱을 둘 것인가. 백테스트
        # (_exit_scalein)와 반드시 같은 식이어야 한다.
        trail_dist = max(e - s, 0.0) * trail_r_mult if s is not None else 0.0
        peak: float | None = None
        for k, bar in enumerate(bars):
            lo, hi, cl = _bar_lhc(bar)
            if not filled:
                if lo <= e:
                    filled = True      # 같은 봉의 손절/목표를 이어서 본다(보수적)
                elif k + 1 >= timeout:
                    return _close_patch("unfilled", today, cl, None)
                else:
                    continue
            # 손절을 목표보다 먼저 본다 — 백테스트와 같은 순서(보수적). 전환된 봉에서
            # 곧바로 본전에 걸리는 일도 이 순서 덕에 생기지 않는다. 이미 전환된 채로
            # 들어온 픽은 _pre_trail 이 그 봉을 걸러 준다(다음 배치의 재판독).
            if (eff_stop is not None and lo <= eff_stop
                    and not _pre_trail(bar, trail_from)):
                if not trailed:
                    status = "stopped"
                else:
                    status = "trailed" if eff_stop > e else "breakeven"
                return _close_patch(status, today, eff_stop, eff_stop / e - 1)
            if not trailed and t1 is not None and hi >= t1:
                trailed = True
                eff_stop = e           # 하한은 평단. 팔지 않는다.
                peak = hi
            if trailed and trail_dist > 0:             # 래칫 — 올라가기만 한다
                peak = hi if peak is None else max(peak, hi)
                eff_stop = max(eff_stop, peak - trail_dist)
            if k + 1 >= timeout:
                return _close_patch("expired", today, cl, cl / e - 1,
                                    tp1_hit=trailed or None)
        if cal_expired:
            if not filled:
                return _close_patch("unfilled", today, last_cl, None)
            return _close_patch("expired", today, last_cl, last_cl / e - 1,
                                tp1_hit=trailed or None)
        if trailed and not pick.get("tp1_hit"):
            # 비종결 — 전환됐다는 사실만 기록한다(다음 배치가 이어서 본다).
            return {"tp1_hit": True, "tp1_hit_at": today.isoformat()}
        return None

    # ── 옛 픽(tp2 없음) 또는 진입가 결손 → 단일 청산 ──
    # 진입가가 없는 픽은 체결 여부를 물을 수 없다 → 예전 동작 그대로(체결된 셈).
    if t2 is None or e is None:
        filled = e is None or next_open
        for k, bar in enumerate(bars):
            lo, hi, cl = _bar_lhc(bar)
            if not filled:
                if lo <= e:
                    filled = True          # 같은 봉에서 손절까지 갔는지 이어서 본다(보수적)
                elif k + 1 >= timeout:
                    return _close_patch("unfilled", today, cl, None)
                else:
                    continue
            if s is not None and lo <= s:
                return _close_patch("stopped", today, s, (s / e - 1) if e else None)
            if t1 is not None and hi >= t1:
                return _close_patch("target", today, t1, (t1 / e - 1) if e else None)
            if k + 1 >= timeout:
                return _close_patch("expired", today, cl, (cl / e - 1) if e else None)
        if cal_expired:
            if not filled:
                return _close_patch("unfilled", today, last_cl, None)
            return _close_patch("expired", today, last_cl, (last_cl / e - 1) if e else None)
        return None

    tp1_hit = bool(pick.get("tp1_hit"))
    trail_from = _trail_from(pick)
    tp1_ret = (t1 / e - 1) if t1 is not None else 0.0
    # tp1 을 이미 맞은 픽은 과거에 체결된 것이다(그때 진입 없이 익절될 수 없다).
    filled = tp1_hit or next_open

    for k, bar in enumerate(bars):
        lo, hi, cl = _bar_lhc(bar)
        if not filled:
            if lo <= e:
                filled = True              # 같은 봉의 손절/목표를 이어서 본다(보수적)
            elif k + 1 >= timeout:
                return _close_patch("unfilled", today, cl, None)
            else:
                continue
        if not tp1_hit:
            if s is not None and lo <= s:                  # 손절(전량)
                return _close_patch("stopped", today, s, s / e - 1)
            if hi >= t2:                                   # tp1·tp2 동시 → 양 트랜치
                return _close_patch("target", today, t2,
                                    0.5 * tp1_ret + 0.5 * (t2 / e - 1), tp1_hit=True)
            if t1 is not None and hi >= t1:                # 1차 익절(비종결) — 본전스톱 전환
                tp1_hit = True
                continue                                   # 같은 봉서 tp2 불허
            if k + 1 >= timeout:
                return _close_patch("expired", today, cl, cl / e - 1)
        else:
            # 전환 봉(과 그 이전)은 건너뛴다 — 그 봉에서는 이미 «tp2 불허»로 지나갔다.
            pre = _pre_trail(bar, trail_from)
            if lo <= e and not pre:                        # 본전 청산 → 1차 익절만 실현
                return _close_patch("partial", today, e, 0.5 * tp1_ret)
            if hi >= t2 and not pre:                       # 2차 목표 → 전량 익절
                return _close_patch("target", today, t2,
                                    0.5 * tp1_ret + 0.5 * (t2 / e - 1))
            if k + 1 >= timeout:
                return _close_patch("expired", today, cl,
                                    0.5 * tp1_ret + 0.5 * (cl / e - 1))

    # ── 봉 소진(타임아웃 미도달) ──
    if cal_expired and not filled:                         # 끝내 진입가에 안 닿음
        return _close_patch("unfilled", today, last_cl, None)
    if cal_expired:                                        # 캘린더 안전망 만료(잔량 종가)
        base = (0.5 * tp1_ret + 0.5 * (last_cl / e - 1)) if tp1_hit else (last_cl / e - 1)
        return _close_patch("expired", today, last_cl, base)
    if tp1_hit and not pick.get("tp1_hit"):               # 신규 1차 익절만 기록(비종결)
        return {"tp1_hit": True, "tp1_hit_at": today.isoformat()}
    return None


def _confirm_levels(pick: dict, open_price: float) -> dict | None:
    """진입 대기 픽 + 확정 시가 → 갱신 패치. 진입 조건이 무너지면 None. (순수 함수)

    **백테스트 open 모드와 같은 계산이다** — event_backtest 는 다음 봉 시가로
    compute_levels 를 다시 돌린다. 손절폭을 그대로 평행이동하는 근사가 아니다:
    구조 손절(지지선)은 절대가라 갭업하면 손절이 «멀어지고» 손익비가 나빠지는데,
    그 열화까지 게이트가 이미 세어 놓았기 때문이다. 근사로 옮기면 게이트와 발행이
    또 미세하게 어긋난다 — 이번 전환의 이유가 정확히 그 어긋남이었다.

    atr 이 없는 픽(레벨 입력을 안 싣던 시절 리포트)은 재계산이 불가능하므로 발행 시
    설계한 «거리»를 보존해 평행이동한다. ATR 손절 경로와는 결과가 같고, 구조 손절
    경로에서만 다르다.

    진입 조건이 무너지는 경우(None): 시가가 비정상이거나, 갭 때문에 손절폭이
    거래로 인정할 최소치(min_risk_floor) 아래로 내려간 경우. 백테스트도 그런
    신호는 거래로 세지 않으므로 라이브도 사지 않는다.
    """
    if open_price is None or open_price <= 0:
        return None
    pp = pick.get("plan_payload") or {}
    atr = pp.get("atr")
    if atr:
        lv = compute_levels(
            style=pick.get("style") or "swing", side="buy",
            entry_price=open_price, atr=float(atr),
            risk_per_trade_pct=float(pp.get("risk_pct") or PICK_RISK_PCT),
            support=pp.get("support"), resistance=pp.get("resistance"),
            setup=pick.get("setup"),
        )
        stop, tp1, tp2 = lv.stop_loss, lv.tp1, lv.tp2
    else:
        planned_entry = pp.get("planned_entry") or pick.get("entry_price")
        if not planned_entry:
            return None
        shift = open_price - float(planned_entry)
        def _mv(v):
            return None if v is None else round(float(v) + shift, 4)
        stop = _mv(pick.get("stop_loss"))
        tp1 = _mv(pick.get("target_price"))
        tp2 = _mv(pick.get("tp2_price"))
    if stop is None or open_price - stop < min_risk_floor(open_price, atr and float(atr)):
        return None
    return {
        "entry_price": round(open_price, 4),
        "stop_loss": round(stop, 4),
        "target_price": None if tp1 is None else round(tp1, 4),
        "tp2_price": None if tp2 is None else round(tp2, 4),
    }


def confirm_pending_picks(today: str | None = None) -> dict[str, int]:
    """진입 대기(pending) 픽을 «다음 거래일 시가»로 확정 — 일일 배치에서 호출.

    발행 시점(D일 장 마감 후)에는 다음날 시가를 모른다. 그래서 픽은 예상 레벨을
    달고 pending 으로 나가고, 다음 거래일 봉이 쌓인 뒤(D+1 배치) 이 함수가 실제
    시가를 진입가로 박고 손절·목표를 그 시가 기준으로 다시 계산한다.

      pending → open     시가 확정. 이후 판정은 «진입 봉부터» 따라간다.
      pending → voided   갭으로 손절폭이 최소치 아래가 됐다. 백테스트가 거래로 세지
                         않는 신호이므로 라이브도 사지 않는다(손익 없음).
      pending 유지        아직 다음 거래일 봉이 없다(발행 당일 재실행 등).
    """
    client = get_client()
    d = date.fromisoformat(today) if today else kst_today()
    rows = (
        client.table("recommendations")
        .select("id,as_of,setup,style,entry_price,target_price,tp2_price,"
                "stop_loss,plan_payload,instrument_id")
        .eq("basket_type", "daily_focus").eq("status", "pending").execute()
    ).data or []

    counts = {"confirmed": 0, "voided": 0, "waiting": 0}
    for p in rows:
        ao = date.fromisoformat(str(p["as_of"]))
        bars = (
            client.table("ohlcv").select("open,ts")
            .eq("instrument_id", p["instrument_id"]).eq("interval", "1d")
            .gt("ts", p["as_of"]).order("ts").limit(1).execute()
        ).data or []
        stale = (d - ao).days >= PENDING_MAX_DAYS
        if not bars:
            # 거래정지·상장폐지로 다음 봉이 영영 안 오면 pending 이 무한정 쌓인다.
            if stale:
                client.table("recommendations").update({
                    "status": "voided", "closed_at": d.isoformat(),
                }).eq("id", p["id"]).execute()
                counts["voided"] += 1
                log.info("picks.confirm.voided_no_bar", pick=p["id"],
                         as_of=str(p["as_of"]))
            else:
                counts["waiting"] += 1
            continue
        bar = bars[0]
        bar_date = str(bar["ts"])[:10]
        # 봉이 한참 뒤에야 왔다면(거래정지 후 재개) 그 시가는 «다음 거래일»이 아니다.
        # 열흘 지난 계획으로 진입하지 않는다 — 백테스트도 다음 봉만 본다.
        if (date.fromisoformat(bar_date) - ao).days >= PENDING_MAX_DAYS:
            client.table("recommendations").update({
                "status": "voided", "closed_at": bar_date,
            }).eq("id", p["id"]).execute()
            counts["voided"] += 1
            log.info("picks.confirm.voided_stale_bar", pick=p["id"],
                     as_of=str(p["as_of"]), bar=bar_date)
            continue
        patch = _confirm_levels(p, float(bar["open"] or 0))
        if patch is None:
            client.table("recommendations").update({
                "status": "voided", "closed_at": bar_date,
                "close_return_pct": None,
            }).eq("id", p["id"]).execute()
            counts["voided"] += 1
            log.info("picks.confirm.voided", pick=p["id"], as_of=str(p["as_of"]),
                     open=bar.get("open"))
            continue
        patch.update({"status": "open", "confirmed_at": bar_date})
        client.table("recommendations").update(patch).eq("id", p["id"]).execute()
        counts["confirmed"] += 1
        if ao and bar_date:
            log.debug("picks.confirm", pick=p["id"], as_of=str(p["as_of"]),
                      confirmed=bar_date, entry=patch["entry_price"])
    log.info("reports.daily.confirm_picks", **counts)
    return counts


def manage_picks(today: str | None = None) -> dict[str, int]:
    """열린 픽 전체의 상태를 종가로 확정 — 일일 배치에서 호출 (갭 프레임 [관리])."""
    client = get_client()
    d = date.fromisoformat(today) if today else kst_today()
    open_picks = (
        client.table("recommendations")
        .select(",".join(PICK_JUDGE_FIELDS))
        .eq("basket_type", "daily_focus").eq("status", "open").execute()
    ).data or []

    counts = {"target": 0, "stopped": 0, "trailed": 0, "breakeven": 0,
              "expired": 0, "partial": 0, "unfilled": 0, "voided": 0,
              "tp1_hit": 0, "open": 0}
    for p in open_picks:
        # 어느 봉부터 따라갈 것인가 — 진입 규칙에 따라 다르다.
        #   next_open: 진입 봉(confirmed_at)«부터». 시가에 이미 샀으므로 그날의
        #     고가/저가로 목표·손절이 터질 수 있다. 백테스트도 i_entry 부터 본다.
        #   limit(옛 픽): 발행일 «다음» 봉부터. 그날 진입가에 닿아야 체결이다.
        ao = date.fromisoformat(str(p["as_of"]))
        start = str(p.get("confirmed_at") or p["as_of"])
        rows = (
            client.table("ohlcv").select("low,high,close,ts")
            .eq("instrument_id", p["instrument_id"]).eq("interval", "1d")
            .gte("ts", start).order("ts").execute()
        ).data or []
        if str(p.get("entry_rule") or "limit") == "next_open" and p.get("confirmed_at"):
            floor_d = date.fromisoformat(start)
            bars = [r for r in rows
                    if date.fromisoformat(str(r["ts"])[:10]) >= floor_d]
        else:
            bars = [r for r in rows if date.fromisoformat(str(r["ts"])[:10]) > ao]
        patch = resolve_pick_status(p, bars, d)
        if patch is None:
            counts["open"] += 1
            continue
        client.table("recommendations").update(patch).eq("id", p["id"]).execute()
        if "status" in patch:                  # 종결 패치
            # 새 종결 상태가 생겨도 배치를 죽이지 않는다 — 2026-08-27 에 본전 청산
            # (breakeven)이 처음 나오면서 KeyError 로 일일 배치가 3번 다 죽었다.
            counts[patch["status"]] = counts.get(patch["status"], 0) + 1
        else:                                  # 1차 익절(비종결) — 여전히 open
            counts["tp1_hit"] += 1
            counts["open"] += 1
    log.info("reports.daily.manage_picks", **counts)
    return counts


def _latest_close_map(as_of: str | None = None) -> dict[int, float]:
    """전 종목 최신 종가 {iid: close} — 진입가 실행가능성 검증용. 직접 PG 우선, REST 폴백.

    as_of: 주면 그 날짜 이하 최신 종가. 과거일 백필에서 오늘 종가로 '실행 가능'을
      판정하면 미래를 보고 고르는 셈이라, 백필 경로는 반드시 as_of 를 넘긴다.
    """
    from engine import db_direct
    if db_direct.available():
        try:
            return db_direct.load_latest_close_1d(as_of=as_of)
        except Exception as e:  # noqa: BLE001
            log.warning("picks.latest_close.direct_failed", error=str(e)[:140])
    out: dict[int, float] = {}
    client = get_client()
    for it in select_all("instruments", "id", eq={"active": True}):
        q = (
            client.table("ohlcv").select("close")
            .eq("instrument_id", it["id"]).eq("interval", "1d")
        )
        if as_of:
            q = q.lte("ts", f"{as_of}T23:59:59")
        px = q.order("ts", desc=True).limit(1).execute().data
        if px and px[0].get("close") is not None:
            out[it["id"]] = float(px[0]["close"])
    return out


def _open_book(as_of: str) -> dict:
    """as_of 시점에 열려 있던 픽이 이미 쓰고 있는 예산 — (건수, 리스크%, 노출%).

    _open_instrument_ids 와 같은 «그 시점 기준» 판정을 쓴다(과거일 백필 정합).
    새 픽은 여기 남은 만큼만 낼 수 있다.
    """
    rows = (
        get_client().table("recommendations")
        .select("instrument_id,as_of,status,closed_at,entry_price,stop_loss")
        .eq("basket_type", "daily_focus").lt("as_of", as_of)
        .execute()
    ).data or []
    held = [r for r in rows
            if r.get("status") == "open" or (r.get("closed_at") or "") > as_of]
    risk = sum(account_risk_pct(r.get("entry_price"), r.get("stop_loss")) for r in held)
    expo = sum(position_size_pct(r.get("entry_price"), r.get("stop_loss")) for r in held)
    return {"count": len(held), "risk_pct": round(risk, 4),
            "exposure_pct": round(expo, 4)}


def _open_instrument_ids(as_of: str) -> set[int]:
    """as_of 시점에 아직 열려 있던 픽의 종목 id 집합 — 재발행 중복 방지용.

    '그 시점 기준'으로 판정한다(closed_at 비교) — 과거일 백필에서도 당시 보유
    상태를 그대로 재현하기 위해서다. 오늘 이미 청산된 픽이 과거 백필에서 열려
    있던 것으로 잡히는 게 정상이다.
    · as_of 당일 발행분은 제외(< as_of) — 같은 날 자기 자신을 막지 않도록.
    · closed_at > as_of 만 '보유 중' — as_of 당일 청산됐다면 그날 종가 분석 시점엔
      이미 나온 상태라 재진입을 막을 이유가 없다.
    """
    rows = (
        get_client().table("recommendations")
        .select("instrument_id,as_of,status,closed_at")
        .eq("basket_type", "daily_focus").lt("as_of", as_of)
        .execute()
    ).data or []
    held = {
        int(r["instrument_id"]) for r in rows
        if r.get("status") == "open" or (r.get("closed_at") or "") > as_of
    }
    if held:
        log.info("reports.daily.picks.held", as_of=as_of, n=len(held))
    return held


def _calendar_blocking(as_of: str) -> list[dict]:
    """픽의 **진입일**에 신규 진입을 막는 캘린더 이벤트. 캘린더가 없으면 빈 목록.

    판정 기준일은 as_of(종가일)가 아니라 그 다음 거래일이다 — 픽은 '종가 분석 →
    다음 거래일 장전 플랜'이라 실제로 사는 날이 하루 뒤다. as_of 로 판정하면 만기일
    당일에 발행을 막는 대신 만기 전날 발행을 막는 꼴이 된다(하루 어긋남).
    """
    from engine.market import calendar as cal
    from engine.market.calendar_store import load_events, load_holidays

    d = date.fromisoformat(as_of)
    entry_day = cal.next_trading_day(d, load_holidays())
    # 억제 선행일 상한만큼 뒤를 본다 — D-N 이벤트가 진입일에 걸릴 수 있으므로.
    events = load_events(entry_day, entry_day + timedelta(days=cal.MAX_BLOCK_DAYS))
    blocking = cal.blocking_events(entry_day, events)
    if blocking:
        log.info("reports.daily.calendar", as_of=as_of,
                 entry_day=entry_day.isoformat(),
                 blocking=[e.get("title") for e in blocking])
    return blocking


def select_and_store_picks(as_of: str, *, gate_as_of: str | None = "same") -> int:
    """해당 일자 발행 리포트에서 픽 선정·적재. 단독 재실행 가능(픽만 갱신).

    같은 날 재실행하면 자연키(0016)로 갱신되지만, 직전 선정에서 빠지게 된
    종목이 남을 수 있어 해당 일자 daily_focus 를 먼저 비우고 다시 채운다.

    gate_as_of: 게이트·기대값을 어느 시점 기준으로 볼 것인가.
      · "same"(기본) — as_of 기준. 그날 알 수 있었던 백테스트만 본다(시점 정합성).
        일일 배치·과거일 백필은 항상 이쪽이다.
      · None — **지금** 기준. 규칙을 바꾼 직후, 이미 지나간 분석일의 픽을 새 규칙으로
        다시 뽑을 때 쓴다(2026-08-22 규칙 교체 후 8/21 재선정). 그날 없던 판정을
        쓰는 것이므로 일상 경로에서 쓰면 안 된다 — 호출부에서 명시할 때만.
    """
    gate_cut = as_of if gate_as_of == "same" else gate_as_of
    client = get_client()
    rows = (
        client.table("reports")
        .select("instrument_id,as_of,summary,payload")
        .eq("report_type", "indepth").eq("status", "published").eq("as_of", as_of)
        .execute()
    ).data or []
    from engine.backtest.runner import passed_combos_from_db
    from engine.signals.horizons import publishable_combos

    # 발행일 시점 시장 국면(<=as_of 최신) — 4국면(market_state)으로 셋업 라우팅.
    reg_row = (
        client.table("market_regime").select("regime,market_state")
        .lte("date", as_of).order("date", desc=True).limit(1).execute()
    ).data
    regime = reg_row[0]["regime"] if reg_row else None
    market_state = reg_row[0].get("market_state") if reg_row else None

    # 섹터 맵 — 픽 집중 분산용. 섹터 미수집(null)이면 자연히 무제약으로 동작.
    sector_by_id = {
        it["id"]: it.get("sector")
        for it in select_all("instruments", "id,sector")
    }

    # 최신 종가 맵 — 진입가 실행가능성 검증용(낡은 시그널 제외). 직접 PG 벌크 우선.
    # as_of 기준으로 자른다: 당일 배치에선 최신 종가와 같고(무해), 과거일 백필에선
    # 미래 종가로 '실행 가능'을 판정하는 사고를 막는다.
    close_by_id = _latest_close_map(as_of)

    # 캘린더 억제 — 동시만기처럼 미리 아는 변동성 구간에 신규 진입을 내지 않는다.
    # 캘린더가 비어 있으면 blocking 도 비어서 기존과 동일하게 동작한다(graceful).
    blocking = _calendar_blocking(as_of)

    # 게이트·기대값도 as_of 기준으로 자른다. 당일 배치에선 최신과 같고(백테스트가
    # 픽보다 먼저 돌아 당일분이 이미 들어 있다), 과거일 백필에선 '나중에 통과하게 된
    # 조합'을 그때 알았던 것처럼 쓰는 사고를 막는다.
    picks = select_picks(
        rows,
        # 게이트 통과 ∩ «지금 발행하는 기간»(장기 휴지, 2026-08-22).
        passed_combos=publishable_combos(passed_combos_from_db(gate_cut)),
        expectancy_by_combo=gate_expectancy_from_db(gate_cut),
        regime=regime,
        market_state=market_state,
        sector_by_id=sector_by_id,
        close_by_id=close_by_id,
        blocking=blocking,
        open_instrument_ids=_open_instrument_ids(as_of),
        open_book=_open_book(as_of),
    )
    log.info("reports.daily.picks.regime", as_of=as_of, regime=regime,
             market_state=market_state)
    rebalance_id = int(as_of.replace("-", ""))
    for p in picks:
        p["rebalance_id"] = rebalance_id
    client.table("recommendations").delete().eq("basket_type", "daily_focus").eq(
        "as_of", as_of
    ).execute()
    n = upsert(
        "recommendations", picks,
        # 자연키에 horizon 이 들어갔다(0039) — 같은 종목이 같은 날 여러 기간으로
        # 발행될 수 있어서다. 옛 키로 upsert 하면 42P10 으로 적재 자체가 실패한다.
        on_conflict="basket_type,instrument_id,as_of,horizon",
    ) if picks else 0
    log.info("reports.daily.picks", as_of=as_of, picks=n)
    return n


def run_daily(*, use_llm: bool = True, cap: int = DAILY_CAP,
              coverage_top: int = COVERAGE_TOP, as_of: str | None = None) -> dict:
    """일일 발행 실행 — 트랙 A/B 리포트 + 오늘의 포커스. 결과 요약 반환.

    as_of: 발행 일자(거래일, YYYY-MM-DD) 명시. 미지정 시 kst_today().
    자정을 넘겨 재실행할 때 대상 거래일로 정확히 라벨링하기 위함.
    """
    today = as_of or kst_today().isoformat()
    today_date = date.fromisoformat(today)
    # [관리] ① 진입 대기 픽을 오늘 시가로 확정 → ② 열린 픽을 오늘 종가로 판정.
    # 순서가 중요하다 — 오늘 확정된 픽은 «그 봉»에서 바로 손절/목표가 터질 수 있고,
    # 백테스트도 진입 봉부터 청산을 추적한다. 확정을 뒤로 미루면 하루를 빼먹는다.
    confirm_status = confirm_pending_picks(today)
    pick_status = manage_picks(today)
    pick_status["confirmed"] = confirm_status.get("confirmed", 0)
    pick_status["pending"] = confirm_status.get("waiting", 0)
    passed = passed_setups_from_db()
    log.info("reports.daily.gate", passed=sorted(passed))

    a = track_a_symbols(passed)
    b = [s for s in track_b_symbols(coverage_top) if s not in set(a)]
    targets = a[:cap]
    targets += b[: max(0, cap - len(targets))]
    if len(a) + len(b) > cap:
        log.warning("reports.daily.cap_truncated", cap=cap,
                    candidates=len(a) + len(b))

    published = skipped = 0
    for i, sym in enumerate(targets):
        is_coverage = i >= len(a[:cap])
        r = publish_indepth(
            sym, use_llm=use_llm,
            skip_unchanged_days=COVERAGE_SKIP_DAYS if is_coverage else 0,
            as_of=today_date,
        )
        if r is None:
            continue
        if r.get("skipped"):
            skipped += 1
        else:
            published += 1

    # 오늘의 포커스 — 그날 발행분에서 선정
    n_picks = select_and_store_picks(today)

    # 시장 브리프를 그날 픽으로 갱신 — 아침 브리프가 가리키던 전일 픽과 EOD 신규 픽이
    # 어긋나 '브리프↔카드' 불일치가 생기던 것 차단(저녁부터 일치). morning 배치가
    # 다음날 아침 해외변수로 다시 갱신.
    from engine.reports.morning import publish_morning
    try:
        publish_morning(use_llm=use_llm, as_of=today)
    except Exception as e:  # noqa: BLE001 — 브리프 실패가 픽 발행을 막지 않게
        log.warning("reports.daily.brief_refresh_failed", error=str(e)[:140])

    log.info("reports.daily.done", track_a=len(a), track_b=len(b),
             published=published, skipped=skipped, picks=n_picks,
             pick_status=pick_status)
    return {"track_a": len(a), "track_b": len(b), "published": published,
            "skipped": skipped, "picks": n_picks, "pick_status": pick_status}
