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

from engine.db import get_client, select_all, upsert
from engine.logging import get_logger
from engine.reports.context import EOD_STYLES, backtest_passed
from engine.reports.runner import publish_indepth

log = get_logger(__name__)

DAILY_CAP = 100            # 일 발행 상한 (비용 가드레일)
COVERAGE_TOP = 50          # 트랙 B — 시총 상위 N
COVERAGE_SKIP_DAYS = 3     # 트랙 B — 판정 동일 시 재발행 생략 기간
PICKS_MAX = 5              # 오늘의 포커스 최대 종목 수
# 매수 판정이 아니어도 픽 후보가 되는 점수 하한.
# 60 → 50 완화(2026-06-11): 판정 체계(매수≥65/중립≥45)에서 50은 "중립 상위".
# 60 기준으론 하루 후보가 1~2개라 포커스 5슬롯이 비어 다님 — 50이면 거래가능+
# 플랜 보유 중립 상위까지 후보가 되어 대체로 5개가 채워진다. 하한 자체는 유지:
# 후보 부족일엔 여전히 5개 미만/빈 날 허용(품질 우선, 억지로 채우지 않음).
PICKS_MIN_SCORE = 50.0


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
                 ) -> list[dict]:
    """오늘의 포커스 선정 — 순수 함수. reports: 그날 발행 리포트 행(payload 포함).

    passed_combos: {setup: [통과 스타일]} — 주입 시 게이트 통과 (setup,style) 플랜만 발행.
    expectancy_by_combo: {(setup,style): expectancy_r} — 복수 통과 시 기대값 높은 스타일 선택.
    기준 미달이면 빈 리스트(빈 날 허용).
    """
    cands = []
    for r in reports:
        p = r.get("payload") or {}
        verdict = p.get("verdict") or {}
        # EOD 스타일 + 게이트 통과 플랜만 — 옛 payload(데이/종가베팅)나 엣지 미검증
        # 조합(게이트 탈락 swing 등)이 픽으로 새지 않게 선정 단에서 이중 방어.
        plan = [
            row for row in (p.get("plan") or [])
            if row.get("style") in EOD_STYLES
            and _plan_gate_ok(row, passed_combos)
        ]
        tradable = (p.get("tradability") or {}).get("passed", False)
        score = float(verdict.get("score") or 0)
        rating = verdict.get("rating")
        if not tradable or not plan:
            continue
        if rating != "매수" and score < min_score:
            continue
        # 종목 내 스타일 선택은 검증 기대값 우선, 종목 간 순위는 점수(score)로.
        cands.append((score, r, _best_plan(plan, expectancy_by_combo)))
    cands.sort(key=lambda t: t[0], reverse=True)

    picks = []
    for score, r, top_plan in cands[:max_picks]:
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


PICK_EXPIRE_DAYS = 30  # 발행 후 30일(달력) 경과 시 만료 — 스윙 보유기간 상한 근사


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


def resolve_pick_status(
    pick: dict, last_close: float | None, today: date
) -> dict | None:
    """열린 픽 1건의 상태 판정 (순수 함수). 변경 없으면 None.

    종가 기준 근사(장중 터치 미반영) — 손절 우선(보수적).

    분할익절(0022): tp2_price 가 있으면 스케일아웃 상태기계.
      1) tp1 전: 손절 / tp1 도달(→1차 익절·본전스톱, 비종결) / 만료
      2) tp1 후: 본전(entry) 청산 → 'partial' / tp2 → 'target' / 만료
      블렌디드 수익 = 0.5·tp1수익 + 0.5·잔량수익.
    tp2_price 가 없으면(옛 픽) 기존 단일 tp1 청산 유지 — 진행 픽 소급 변경 방지.
    """
    if last_close is None:
        return None
    stop = pick.get("stop_loss")
    tp1 = pick.get("target_price")
    tp2 = pick.get("tp2_price")
    entry = pick.get("entry_price")
    tp1_hit = bool(pick.get("tp1_hit"))
    as_of = date.fromisoformat(str(pick["as_of"]))
    expired = (today - as_of).days >= PICK_EXPIRE_DAYS

    # ── 옛 픽(tp2 없음) 또는 진입가 결손 → 기존 단일 청산 ──
    if tp2 is None or entry in (None, 0):
        status: str | None = None
        if stop is not None and last_close <= float(stop):
            status = "stopped"
        elif tp1 is not None and last_close >= float(tp1):
            status = "target"
        elif expired:
            status = "expired"
        if status is None:
            return None
        ret = (last_close / float(entry) - 1) if entry not in (None, 0) else None
        return _close_patch(status, today, last_close, ret)

    e = float(entry)
    tp1_ret = (float(tp1) / e - 1) if tp1 is not None else 0.0

    if not tp1_hit:
        if stop is not None and last_close <= float(stop):           # 손절(전량)
            return _close_patch("stopped", today, last_close, last_close / e - 1)
        if last_close >= float(tp2):           # tp1·tp2 동시 돌파 → 양 트랜치 실현
            blended = 0.5 * tp1_ret + 0.5 * (float(tp2) / e - 1)
            return _close_patch("target", today, last_close, blended, tp1_hit=True)
        if tp1 is not None and last_close >= float(tp1):             # 1차 익절(비종결)
            return {"tp1_hit": True, "tp1_hit_at": today.isoformat()}
        if expired:
            return _close_patch("expired", today, last_close, last_close / e - 1)
        return None

    # ── tp1 익절 후: 잔량은 본전스톱 / tp2 / 만료 ──
    if last_close <= e:                        # 본전 청산 → 1차 익절만 실현
        return _close_patch("partial", today, last_close, 0.5 * tp1_ret + 0.5 * 0.0)
    if last_close >= float(tp2):               # 2차 목표 → 전량 익절
        return _close_patch("target", today, last_close,
                            0.5 * tp1_ret + 0.5 * (float(tp2) / e - 1))
    if expired:                                # 만료 → 잔량 종가 청산
        return _close_patch("expired", today, last_close,
                            0.5 * tp1_ret + 0.5 * (last_close / e - 1))
    return None


def manage_picks(today: str | None = None) -> dict[str, int]:
    """열린 픽 전체의 상태를 종가로 확정 — 일일 배치에서 호출 (갭 프레임 [관리])."""
    client = get_client()
    d = date.fromisoformat(today) if today else date.today()
    open_picks = (
        client.table("recommendations")
        .select("id,as_of,entry_price,target_price,tp2_price,stop_loss,"
                "tp1_hit,instrument_id")
        .eq("basket_type", "daily_focus").eq("status", "open").execute()
    ).data or []

    counts = {"target": 0, "stopped": 0, "expired": 0, "partial": 0,
              "tp1_hit": 0, "open": 0}
    for p in open_picks:
        last = (
            client.table("ohlcv").select("close")
            .eq("instrument_id", p["instrument_id"]).eq("interval", "1d")
            .order("ts", desc=True).limit(1).execute()
        ).data
        last_close = float(last[0]["close"]) if last else None
        patch = resolve_pick_status(p, last_close, d)
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

    picks = select_picks(
        rows,
        passed_combos=passed_combos_from_db(),
        expectancy_by_combo=gate_expectancy_from_db(),
    )
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

    log.info("reports.daily.done", track_a=len(a), track_b=len(b),
             published=published, skipped=skipped, picks=n_picks,
             pick_status=pick_status)
    return {"track_a": len(a), "track_b": len(b), "published": published,
            "skipped": skipped, "picks": n_picks, "pick_status": pick_status}
