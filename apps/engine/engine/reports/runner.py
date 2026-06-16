"""인뎁스 리포트 발행 — 컨텍스트 로드 → (LLM) 서술 → reports 업서트.

같은 종목·같은 날짜는 자연키(report_type,instrument_id,as_of)로 갱신(0011).
"""
from __future__ import annotations

from datetime import date

from engine.config import get_settings
from engine.db import get_client, upsert
from engine.logging import get_logger
from engine.reports.context import load_context
from engine.reports.llm import generate_narrative
from engine.reports.render import fallback_narrative, render_body_md, render_summary

log = get_logger(__name__)

SOURCE_VERSION = "reports-v1"


def _top_symbols(limit: int) -> list[str]:
    """발행 대상 자동 선정 — 매수 시그널 보유 종목을 합성알파 순으로."""
    client = get_client()
    scores = (
        client.table("factor_scores")
        .select("instrument_id,composite_alpha,instruments(symbol,active)")
        .order("composite_alpha", desc=True).limit(limit * 3).execute()
    ).data or []
    out: list[str] = []
    seen: set[str] = set()
    for r in scores:
        inst = r.get("instruments") or {}
        if not inst.get("active") or inst.get("symbol") in seen:
            continue
        seen.add(inst["symbol"])
        sig = (
            client.table("signals").select("id")
            .eq("instrument_id", r["instrument_id"]).eq("signal_type", "buy")
            .limit(1).execute()
        ).data
        if sig:
            out.append(inst["symbol"])
        if len(out) >= limit:
            break
    return out


def _latest_report(instrument_id: int) -> dict | None:
    res = (
        get_client().table("reports")
        .select("rating,as_of")
        .eq("instrument_id", instrument_id).eq("report_type", "indepth")
        .eq("status", "published")
        .order("as_of", desc=True).limit(1).execute()
    )
    return (res.data or [None])[0]


def should_skip_unchanged(
    prev: dict | None, new_rating: str, today: date, max_age_days: int
) -> bool:
    """발행 규정 v1 커버리지 트랙 — 판정이 같고 최근 발행이면 재발행 생략(비용 절약)."""
    if prev is None or max_age_days <= 0:
        return False
    if prev.get("rating") != new_rating:
        return False
    try:
        prev_date = date.fromisoformat(str(prev.get("as_of")))
    except ValueError:
        return False
    return (today - prev_date).days < max_age_days


def publish_indepth(
    symbol: str,
    *,
    use_llm: bool = True,
    publish: bool = True,
    skip_unchanged_days: int = 0,
    as_of: date | None = None,
) -> dict | None:
    """심볼 1개 종목 심층분석 리포트 생성·저장. 반환: 저장 행(요약) 또는 None.

    발행 규정 v1:
    - 모델 분담 — '매수' 판정은 claude_report_model(Opus), 그 외 claude_summary_model.
    - skip_unchanged_days>0 (커버리지 트랙): 판정 동일 + 기존 발행이 해당 일수
      이내면 재발행 생략.
    - as_of: 발행 일자(거래일) 명시. 미지정 시 date.today(). 자정을 넘겨 재실행해도
      대상 거래일로 정확히 라벨링하기 위함(midnight-rollover 방어).
    """
    ctx = load_context(symbol)
    if ctx is None:
        log.warning("reports.indepth.symbol_not_found", symbol=symbol)
        return None

    s = get_settings()
    rating = ctx["verdict"]["rating"]
    today = as_of or date.today()

    if skip_unchanged_days > 0 and should_skip_unchanged(
        _latest_report(ctx["instrument"]["id"]), rating, today, skip_unchanged_days
    ):
        log.info("reports.indepth.skip_unchanged", symbol=symbol, rating=rating)
        return {"symbol": symbol, "rating": rating, "llm": False,
                "title": "", "skipped": True}

    # '거래 부적합'은 결론이 정해져 있어 LLM 서술이 불필요 — 템플릿 발행(비용 0).
    # 웹 목록에서도 기본 숨김(종목 상세에서만 경고로 노출).
    if rating == "거래 부적합":
        use_llm = False
    model = s.claude_report_model if rating == "매수" else s.claude_summary_model
    narrative = generate_narrative(ctx, model=model) if use_llm else None
    llm_used = narrative is not None
    if narrative is None:
        narrative = fallback_narrative(ctx)

    plan = ctx.get("plan") or []
    row = {
        "report_type": "indepth",
        "instrument_id": ctx["instrument"]["id"],
        "title": f"{ctx['instrument']['name']} 종목 심층분석 — {rating}",
        "as_of": today.isoformat(),
        "status": "published" if publish else "draft",
        "rating": rating,
        "target_price": plan[0]["tp1"] if plan else None,
        "summary": render_summary(ctx, narrative),
        "body_md": render_body_md(ctx, narrative),
        "payload": {**{k: v for k, v in ctx.items() if k != "source_refs"},
                    "narrative": narrative},
        "source_refs": ctx["source_refs"],
        "model_version": (model if llm_used else "template") + f"+{SOURCE_VERSION}",
    }
    upsert("reports", [row], on_conflict="report_type,instrument_id,as_of")
    log.info("reports.indepth.published", symbol=symbol, rating=rating, llm=llm_used)
    return {"symbol": symbol, "rating": rating, "llm": llm_used,
            "title": row["title"]}


def run_indepth(symbols: list[str] | None = None, *, top: int = 3,
                use_llm: bool = True, publish: bool = True) -> list[dict]:
    """여러 종목 발행. symbols 미지정 시 합성알파 상위 + 매수시그널 보유 종목."""
    targets = symbols or _top_symbols(top)
    results = []
    for sym in targets:
        r = publish_indepth(sym, use_llm=use_llm, publish=publish)
        if r:
            results.append(r)
    return results
