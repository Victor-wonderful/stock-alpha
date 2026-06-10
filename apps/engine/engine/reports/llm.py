"""Claude 서술 생성 — 키 없거나 호출 실패 시 None (템플릿 폴백은 render 가 담당)."""
from __future__ import annotations

import json

from engine.config import get_settings
from engine.logging import get_logger
from engine.reports.prompts import SYSTEM, user_prompt

log = get_logger(__name__)

NARRATIVE_KEYS = ("thesis", "trader_view", "quant_view", "risks")


def parse_json_keys(text: str, keys: tuple[str, ...]) -> dict | None:
    """LLM 응답 텍스트 → dict. 코드펜스 허용, 필수 키 검증. (범용)"""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```")[1]
        t = t[t.find("{"):]
    start, end = t.find("{"), t.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(t[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not all(k in data for k in keys):
        return None
    return {k: data[k] for k in keys}


def parse_narrative(text: str) -> dict | None:
    """인뎁스 서술 파싱 — risks 는 리스트여야 함."""
    data = parse_json_keys(text, NARRATIVE_KEYS)
    if data is None or not isinstance(data["risks"], list):
        return None
    return data


def generate_json(
    system: str, user: str, keys: tuple[str, ...],
    model: str | None = None, max_tokens: int = 1500,
) -> dict | None:
    """범용 Claude JSON 생성 — 실패는 조용히 None (발행은 템플릿 폴백)."""
    s = get_settings()
    if not s.anthropic_api_key:
        log.warning("reports.llm.no_api_key")
        return None
    try:
        import anthropic  # lazy import

        client = anthropic.Anthropic(api_key=s.anthropic_api_key)
        msg = client.messages.create(
            model=model or s.claude_summary_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        out = parse_json_keys(text, keys)
        if out is None:
            log.warning("reports.llm.parse_failed", raw=text[:200])
        return out
    except Exception as e:  # noqa: BLE001
        log.warning("reports.llm.error", error=str(e))
        return None


def generate_narrative(context: dict, model: str | None = None) -> dict | None:
    """컨텍스트 → Claude 서술. 실패는 조용히 None (리포트 발행은 계속).

    model 미지정 시 settings.claude_report_model. 발행 규정 v1: 대량 발행은
    claude_summary_model(Sonnet), '매수' 판정은 claude_report_model(Opus).
    """
    s = get_settings()
    if not s.anthropic_api_key:
        log.warning("reports.llm.no_api_key")
        return None
    try:
        import anthropic  # lazy import

        client = anthropic.Anthropic(api_key=s.anthropic_api_key)
        msg = client.messages.create(
            model=model or s.claude_report_model,
            max_tokens=2000,
            system=SYSTEM,
            messages=[{"role": "user", "content": user_prompt(context)}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        out = parse_narrative(text)
        if out is None:
            log.warning("reports.llm.parse_failed", raw=text[:200])
        return out
    except Exception as e:  # noqa: BLE001 — 발행 파이프라인은 LLM 실패에 견뎌야 함
        log.warning("reports.llm.error", error=str(e))
        return None
