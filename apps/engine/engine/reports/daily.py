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

from datetime import date

from engine.backtest.event_backtest import _TIMEOUT_BARS
from engine.db import get_client, select_all, upsert
from engine.logging import get_logger
from engine.reports.context import EOD_STYLES, backtest_passed
from engine.reports.runner import publish_indepth

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
TREND_PICK_SETUPS = frozenset(
    {"high_52w", "breakout", "vol_squeeze", "leader_trend", "pullback"}
)


def passed_setups_from_db() -> set[str]:
    """backtests 최신 행 기준 게이트 통과 셋업 집합 (재백테스트 없이 read).

    매트릭스(셋업×스타일) 이후: 어떤 스타일로든 통과하면 그 셋업 포함(셋업 단위 소비처용).
    """
    latest: dict[tuple[str, str], dict] = {}
    for bt in sorted(
        select_all("backtests",
                   "setup,style,win_rate,avg_rr,mdd,expectancy_r,passed,created_at"),
        key=lambda b: b.get("created_at") or "",
    ):
        if bt.get("setup"):
            latest[(bt["setup"], bt.get("style") or "")] = bt
    return {setup for (setup, _s), bt in latest.items() if backtest_passed(bt)}


def gate_expectancy_from_db() -> dict[tuple[str, str], float]:
    """backtests 최신 행 기준 (setup,style)→expectancy_r — 복수 통과 스타일 중 선택용."""
    latest: dict[tuple[str, str], dict] = {}
    for bt in sorted(
        select_all("backtests", "setup,style,expectancy_r,created_at"),
        key=lambda b: b.get("created_at") or "",
    ):
        if bt.get("setup") and bt.get("style"):
            latest[(bt["setup"], bt["style"])] = bt
    return {
        k: float(bt["expectancy_r"])
        for k, bt in latest.items()
        if bt.get("expectancy_r") is not None
    }


def track_a_symbols(passed: set[str]) -> list[str]:
    """트랙 A — 게이트 통과 셋업의 EOD 매수 시그널 보유 종목 (강도순)."""
    rows = (
        get_client().table("signals")
        .select("setup,style,strength,instruments(symbol,active)")
        .eq("signal_type", "buy")
        .order("strength", desc=True).limit(2000).execute()
    ).data or []
    out: list[str] = []
    seen: set[str] = set()
    for r in rows:
        inst = r.get("instruments") or {}
        sym = inst.get("symbol")
        if (
            r.get("setup") in passed
            and r.get("style") in EOD_STYLES
            and inst.get("active")
            and sym and sym not in seen
        ):
            seen.add(sym)
            out.append(sym)
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
    return row.get("style") in passed_combos.get(row.get("setup") or "", [])


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
            exp = expectancy_by_combo.get((row.get("setup"), row.get("style")))
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
                 sector_by_id: dict[int, str | None] | None = None,
                 max_per_sector: int = PICKS_MAX_PER_SECTOR,
                 close_by_id: dict[int, float | None] | None = None,
                 max_entry_drift: float = PICKS_MAX_ENTRY_DRIFT,
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
    기준 미달이면 빈 리스트(빈 날 허용).
    """
    risk_off = regime == "risk_off"
    cands = []
    for r in reports:
        p = r.get("payload") or {}
        verdict = p.get("verdict") or {}
        close = (close_by_id or {}).get(r["instrument_id"])
        score = float(verdict.get("score") or 0)
        rating = verdict.get("rating")
        # EOD 스타일 + 게이트 통과 플랜만 — 옛 payload(데이/종가베팅)나 엣지 미검증
        # 조합(게이트 탈락 swing 등)이 픽으로 새지 않게 선정 단에서 이중 방어.
        # + 진입가 실행가능성(낡은 시그널 제외).
        # risk_off 추세 억제는 '매수 등급이 아닌' 픽에만 적용 — 고확신 매수 추세픽
        # (분석 최고점)은 하락장에도 노출(UI 경고와 짝), 약한 중립 추세픽만 억제
        # (검증: 하락장 추세픽 평균 -2.85%). 수급(flow)은 전 국면 허용.
        plan = [
            row for row in (p.get("plan") or [])
            if row.get("style") in EOD_STYLES
            and row.get("setup") not in PICK_EXCLUDED_SETUPS
            and not (risk_off and rating != "매수" and row.get("setup") in TREND_PICK_SETUPS)
            and _plan_gate_ok(row, passed_combos)
            and _entry_actionable(row, close, max_entry_drift)
        ]
        tradable = (p.get("tradability") or {}).get("passed", False)
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
    for cand in cands:
        if len(selected) >= max_picks:
            break
        sec = (sector_by_id or {}).get(cand[1]["instrument_id"])
        known = bool(sec) and sec != "ALL"
        if known and sec_count.get(sec, 0) >= max_per_sector:
            continue
        selected.append(cand)
        if known:
            sec_count[sec] = sec_count.get(sec, 0) + 1

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
            "entry_price": top_plan.get("entry_price"),
            "target_price": top_plan.get("tp1"),
            "tp2_price": top_plan.get("tp2"),   # 스케일아웃 잔량 런 목표(있으면 분할청산)
            "stop_loss": top_plan.get("stop_loss"),
            "as_of": r["as_of"],
        })
    return picks


# 캘린더 안전망 — 타임아웃은 스타일별 봉 수(_TIMEOUT_BARS)가 주(主). 거래정지/상장폐지로
# 봉이 안 쌓여 봉-타임아웃에 영영 못 닿는 픽만 이 날짜로 강제 만료(position 60봉≈84일보다 길게).
PICK_EXPIRE_DAYS = 120


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
    timeout = _TIMEOUT_BARS.get(pick.get("style"), 10)
    as_of = date.fromisoformat(str(pick["as_of"]))
    cal_expired = (today - as_of).days >= PICK_EXPIRE_DAYS
    last_cl = _bar_lhc(bars[-1])[2]

    # ── 옛 픽(tp2 없음) 또는 진입가 결손 → 단일 청산 ──
    if t2 is None or e is None:
        for k, bar in enumerate(bars):
            lo, hi, cl = _bar_lhc(bar)
            if s is not None and lo <= s:
                return _close_patch("stopped", today, s, (s / e - 1) if e else None)
            if t1 is not None and hi >= t1:
                return _close_patch("target", today, t1, (t1 / e - 1) if e else None)
            if k + 1 >= timeout:
                return _close_patch("expired", today, cl, (cl / e - 1) if e else None)
        if cal_expired:
            return _close_patch("expired", today, last_cl, (last_cl / e - 1) if e else None)
        return None

    tp1_hit = bool(pick.get("tp1_hit"))
    tp1_ret = (t1 / e - 1) if t1 is not None else 0.0

    for k, bar in enumerate(bars):
        lo, hi, cl = _bar_lhc(bar)
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
            if lo <= e:                                    # 본전 청산 → 1차 익절만 실현
                return _close_patch("partial", today, e, 0.5 * tp1_ret)
            if hi >= t2:                                   # 2차 목표 → 전량 익절
                return _close_patch("target", today, t2,
                                    0.5 * tp1_ret + 0.5 * (t2 / e - 1))
            if k + 1 >= timeout:
                return _close_patch("expired", today, cl,
                                    0.5 * tp1_ret + 0.5 * (cl / e - 1))

    # ── 봉 소진(타임아웃 미도달) ──
    if cal_expired:                                        # 캘린더 안전망 만료(잔량 종가)
        base = (0.5 * tp1_ret + 0.5 * (last_cl / e - 1)) if tp1_hit else (last_cl / e - 1)
        return _close_patch("expired", today, last_cl, base)
    if tp1_hit and not pick.get("tp1_hit"):               # 신규 1차 익절만 기록(비종결)
        return {"tp1_hit": True, "tp1_hit_at": today.isoformat()}
    return None


def manage_picks(today: str | None = None) -> dict[str, int]:
    """열린 픽 전체의 상태를 종가로 확정 — 일일 배치에서 호출 (갭 프레임 [관리])."""
    client = get_client()
    d = date.fromisoformat(today) if today else date.today()
    open_picks = (
        client.table("recommendations")
        .select("id,as_of,entry_price,target_price,tp2_price,stop_loss,"
                "tp1_hit,style,instrument_id")
        .eq("basket_type", "daily_focus").eq("status", "open").execute()
    ).data or []

    counts = {"target": 0, "stopped": 0, "expired": 0, "partial": 0,
              "tp1_hit": 0, "open": 0}
    for p in open_picks:
        # 진입(as_of) 다음 거래일부터의 일봉을 시간순으로 — 장중 고가/저가 터치 판정용.
        ao = date.fromisoformat(str(p["as_of"]))
        rows = (
            client.table("ohlcv").select("low,high,close,ts")
            .eq("instrument_id", p["instrument_id"]).eq("interval", "1d")
            .gte("ts", p["as_of"]).order("ts").execute()
        ).data or []
        bars = [r for r in rows if date.fromisoformat(str(r["ts"])[:10]) > ao]
        patch = resolve_pick_status(p, bars, d)
        if patch is None:
            counts["open"] += 1
            continue
        client.table("recommendations").update(patch).eq("id", p["id"]).execute()
        if "status" in patch:                  # 종결 패치
            counts[patch["status"]] += 1
        else:                                  # 1차 익절(비종결) — 여전히 open
            counts["tp1_hit"] += 1
            counts["open"] += 1
    log.info("reports.daily.manage_picks", **counts)
    return counts


def _latest_close_map() -> dict[int, float]:
    """전 종목 최신 종가 {iid: close} — 진입가 실행가능성 검증용. 직접 PG 우선, REST 폴백."""
    from engine import db_direct
    if db_direct.available():
        try:
            return db_direct.load_latest_close_1d()
        except Exception as e:  # noqa: BLE001
            log.warning("picks.latest_close.direct_failed", error=str(e)[:140])
    out: dict[int, float] = {}
    client = get_client()
    for it in select_all("instruments", "id", eq={"active": True}):
        px = (
            client.table("ohlcv").select("close")
            .eq("instrument_id", it["id"]).eq("interval", "1d")
            .order("ts", desc=True).limit(1).execute()
        ).data
        if px and px[0].get("close") is not None:
            out[it["id"]] = float(px[0]["close"])
    return out


def select_and_store_picks(as_of: str) -> int:
    """해당 일자 발행 리포트에서 픽 선정·적재. 단독 재실행 가능(픽만 갱신).

    같은 날 재실행하면 자연키(0016)로 갱신되지만, 직전 선정에서 빠지게 된
    종목이 남을 수 있어 해당 일자 daily_focus 를 먼저 비우고 다시 채운다.
    """
    client = get_client()
    rows = (
        client.table("reports")
        .select("instrument_id,as_of,summary,payload")
        .eq("report_type", "indepth").eq("status", "published").eq("as_of", as_of)
        .execute()
    ).data or []
    from engine.backtest.runner import passed_combos_from_db

    # 발행일 시점 시장 국면(<=as_of 최신) — risk_off 면 추세·돌파 픽 억제.
    reg_row = (
        client.table("market_regime").select("regime")
        .lte("date", as_of).order("date", desc=True).limit(1).execute()
    ).data
    regime = reg_row[0]["regime"] if reg_row else None

    # 섹터 맵 — 픽 집중 분산용. 섹터 미수집(null)이면 자연히 무제약으로 동작.
    sector_by_id = {
        it["id"]: it.get("sector")
        for it in select_all("instruments", "id,sector")
    }

    # 최신 종가 맵 — 진입가 실행가능성 검증용(낡은 시그널 제외). 직접 PG 벌크 우선.
    close_by_id = _latest_close_map()

    picks = select_picks(
        rows,
        passed_combos=passed_combos_from_db(),
        expectancy_by_combo=gate_expectancy_from_db(),
        regime=regime,
        sector_by_id=sector_by_id,
        close_by_id=close_by_id,
    )
    log.info("reports.daily.picks.regime", as_of=as_of, regime=regime)
    rebalance_id = int(as_of.replace("-", ""))
    for p in picks:
        p["rebalance_id"] = rebalance_id
    client.table("recommendations").delete().eq("basket_type", "daily_focus").eq(
        "as_of", as_of
    ).execute()
    n = upsert(
        "recommendations", picks,
        on_conflict="basket_type,instrument_id,as_of",
    ) if picks else 0
    log.info("reports.daily.picks", as_of=as_of, picks=n)
    return n


def run_daily(*, use_llm: bool = True, cap: int = DAILY_CAP,
              coverage_top: int = COVERAGE_TOP, as_of: str | None = None) -> dict:
    """일일 발행 실행 — 트랙 A/B 리포트 + 오늘의 포커스. 결과 요약 반환.

    as_of: 발행 일자(거래일, YYYY-MM-DD) 명시. 미지정 시 date.today().
    자정을 넘겨 재실행할 때 대상 거래일로 정확히 라벨링하기 위함.
    """
    today = as_of or date.today().isoformat()
    today_date = date.fromisoformat(today)
    # [관리] 어제까지의 열린 픽을 오늘 종가로 먼저 확정(목표/손절/만료)
    pick_status = manage_picks(today)
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
