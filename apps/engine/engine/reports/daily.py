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
PICKS_MIN_SCORE = 60.0     # 매수 판정이 아니어도 픽 후보가 되는 점수 하한


def passed_setups_from_db() -> set[str]:
    """backtests 최신 행 기준 게이트 통과 셋업 집합 (재백테스트 없이 read)."""
    latest: dict[str, dict] = {}
    for bt in sorted(
        select_all("backtests", "setup,win_rate,avg_rr,mdd,expectancy_r,passed,created_at"),
        key=lambda b: b.get("created_at") or "",
    ):
        if bt.get("setup"):
            latest[bt["setup"]] = bt
    return {s for s, bt in latest.items() if backtest_passed(bt)}


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


def select_picks(reports: list[dict], *, max_picks: int = PICKS_MAX,
                 min_score: float = PICKS_MIN_SCORE) -> list[dict]:
    """오늘의 포커스 선정 — 순수 함수. reports: 그날 발행 리포트 행(payload 포함).

    기준 미달이면 빈 리스트(빈 날 허용).
    """
    cands = []
    for r in reports:
        p = r.get("payload") or {}
        verdict = p.get("verdict") or {}
        # EOD 스타일 플랜만 — 발행 정책 변경 전의 옛 payload(데이/종가베팅 플랜)가
        # 섞여 있어도 픽으로 새지 않게 선정 단에서도 필터(이중 방어).
        plan = [
            row for row in (p.get("plan") or [])
            if row.get("style") in EOD_STYLES
        ]
        tradable = (p.get("tradability") or {}).get("passed", False)
        score = float(verdict.get("score") or 0)
        rating = verdict.get("rating")
        if not tradable or not plan:
            continue
        if rating != "매수" and score < min_score:
            continue
        cands.append((score, r, plan[0]))
    cands.sort(key=lambda t: t[0], reverse=True)

    picks = []
    for score, r, top_plan in cands[:max_picks]:
        narrative = (r.get("payload") or {}).get("narrative") or {}
        picks.append({
            "basket_type": "daily_focus",
            "style": top_plan["style"],
            "instrument_id": r["instrument_id"],
            "weight": None,
            "conviction": round(min(score / 100.0, 1.0), 4),
            "thesis": narrative.get("thesis") or r.get("summary"),
            "entry_price": top_plan.get("entry_price"),
            "target_price": top_plan.get("tp1"),
            "stop_loss": top_plan.get("stop_loss"),
            "as_of": r["as_of"],
        })
    return picks


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
    picks = select_picks(rows)
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
              coverage_top: int = COVERAGE_TOP) -> dict:
    """일일 발행 실행 — 트랙 A/B 리포트 + 오늘의 포커스. 결과 요약 반환."""
    today = date.today().isoformat()
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
             published=published, skipped=skipped, picks=n_picks)
    return {"track_a": len(a), "track_b": len(b), "published": published,
            "skipped": skipped, "picks": n_picks,
            "pick_symbols": [p["instrument_id"] for p in picks]}
