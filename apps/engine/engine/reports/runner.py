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
    for r in scores:
        inst = r.get("instruments") or {}
        if not inst.get("active"):
            continue
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


def publish_indepth(symbol: str, *, use_llm: bool = True, publish: bool = True) -> dict | None:
    """심볼 1개 인뎁스 리포트 생성·저장. 반환: 저장 행(요약) 또는 None."""
    ctx = load_context(symbol)
    if ctx is None:
        log.warning("reports.indepth.symbol_not_found", symbol=symbol)
        return None

    narrative = generate_narrative(ctx) if use_llm else None
    llm_used = narrative is not None
    if narrative is None:
        narrative = fallback_narrative(ctx)

    s = get_settings()
    plan = ctx.get("plan") or []
    row = {
        "report_type": "indepth",
        "instrument_id": ctx["instrument"]["id"],
        "title": f"{ctx['instrument']['name']} 인뎁스 — {ctx['verdict']['rating']}",
        "as_of": date.today().isoformat(),
        "status": "published" if publish else "draft",
        "rating": ctx["verdict"]["rating"],
        "target_price": plan[0]["tp1"] if plan else None,
        "summary": render_summary(ctx, narrative),
        "body_md": render_body_md(ctx, narrative),
        "payload": {**{k: v for k, v in ctx.items() if k != "source_refs"},
                    "narrative": narrative},
        "source_refs": ctx["source_refs"],
        "model_version": (s.claude_report_model if llm_used else "template")
                         + f"+{SOURCE_VERSION}",
    }
    upsert("reports", [row], on_conflict="report_type,instrument_id,as_of")
    log.info("reports.indepth.published", symbol=symbol,
             rating=row["rating"], llm=llm_used)
    return {"symbol": symbol, "rating": row["rating"], "llm": llm_used,
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
