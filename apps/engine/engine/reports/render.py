"""리포트 렌더링 — 컨텍스트(+서술) → body_md / summary. 순수 함수."""
from __future__ import annotations

DISCLAIMER = (
    "본 자료는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고 정보이며, "
    "특정 개인에 대한 맞춤형 투자자문이 아닙니다. 투자 판단과 그 결과에 대한 "
    "책임은 투자자 본인에게 있습니다. 과거 성과(백테스트 포함)는 미래 수익을 "
    "보장하지 않습니다."
)


def _won(v: float | None) -> str:
    return f"{v:,.0f}원" if v is not None else "—"


def _pct(v: float | None, digits: int = 1) -> str:
    return f"{v:.{digits}f}%" if v is not None else "—"


def _eokwon(v: float | None) -> str:
    """KRW → 억원 표기."""
    return f"{v / 1e8:,.1f}억원" if v is not None else "—"


def fallback_narrative(ctx: dict) -> dict:
    """LLM 미사용 시 결정적 템플릿 서술 — 수치 그대로 나열."""
    name = ctx["instrument"]["name"]
    v = ctx["verdict"]
    plan = ctx.get("plan") or []
    top = plan[0] if plan else None
    fac = ctx.get("factor") or {}
    bts = ctx.get("backtests") or []

    thesis = (
        f"{name} 종합 점수 {v['score']}점({v['rating']}). "
        "멀티팩터·밸류에이션·트레이더 셋업을 가중 합산한 결정적 판정입니다."
    )
    trader = (
        f"가장 강한 셋업은 {top['setup']}({top['style']}) — 진입 {_won(top['entry_price'])}, "
        f"손절 {_won(top['stop_loss'])}, 1차 목표 {_won(top['tp1'])}, "
        f"손익비 {top['risk_reward'] if top['risk_reward'] is not None else '—'}R 입니다."
        if top else "현재 발행된 매수 셋업이 없습니다."
    )
    alpha = fac.get("composite_alpha")
    quant = (
        f"합성 알파 {alpha if alpha is not None else '—'}, "
        + ", ".join(
            f"{b['setup']} 백테스트 승률 {_pct((b['win_rate'] or 0) * 100, 0)}"
            for b in bts[:2]
        )
        if bts else "퀀트 팩터·백테스트 수치는 본문 표를 참조하십시오."
    )
    risks = [c["label"] + " 미통과" for c in ctx["tradability"]["checks"] if not c["passed"]]
    return {
        "thesis": thesis,
        "trader_view": trader,
        "quant_view": quant,
        "risks": risks or ["시장 전반 변동성 확대 시 손절 라인 준수가 필요합니다."],
    }


def render_summary(ctx: dict, narrative: dict) -> str:
    return narrative["thesis"]


def render_body_md(ctx: dict, narrative: dict) -> str:
    inst = ctx["instrument"]
    v = ctx["verdict"]
    lines: list[str] = [
        f"# {inst['name']} ({inst['symbol']}) 종목 심층분석",
        "",
        f"## ① 판정 — {v['rating']} (종합 {v['score']}점)",
        "",
        narrative["thesis"],
        "",
        "## ② 거래 가능 게이트",
        "",
    ]
    for c in ctx["tradability"]["checks"]:
        mark = "✅" if c["passed"] else "❌"
        lines.append(f"- {mark} {c['label']}")
    lines += ["", "## ③ 실행 플랜 (스타일별 진입·손절·목표)", ""]
    plan = ctx.get("plan") or []
    if plan:
        lines.append("| 스타일 | 셋업 | 진입 | 손절 | TP1 | TP2 | R:R |")
        lines.append("|---|---|---|---|---|---|---|")
        for p in plan:
            lines.append(
                f"| {p['style']} | {p['setup']} | {_won(p['entry_price'])} "
                f"| {_won(p['stop_loss'])} | {_won(p['tp1'])} | {_won(p['tp2'])} "
                f"| {p['risk_reward'] if p['risk_reward'] is not None else '—'} |"
            )
    else:
        lines.append("현재 발행된 매수 셋업 없음.")
    lines += [
        "",
        "## ④ 근거",
        "",
        "### 트레이더 관점",
        "",
        narrative["trader_view"],
        "",
        "### 퀀트 모델 관점",
        "",
        narrative["quant_view"],
        "",
    ]
    val = ctx.get("valuation")
    if val:
        lines += [
            f"- PER {val['per'] if val['per'] is not None else '—'} · "
            f"PBR {val['pbr'] if val['pbr'] is not None else '—'} · "
            f"ROE {_pct(val['roe'])} · DCF {_won(val['dcf_value'])} · "
            f"업사이드 {_pct(val['upside_pct'])}",
        ]
    fl = ctx.get("flows")
    if fl:
        lines += [
            f"- 최근 {fl['window_days']}일 수급 — 외국인 {_eokwon(fl['foreign_net'])}, "
            f"기관 {_eokwon(fl['inst_net'])}",
        ]
    lines += ["", "## ⑤ 리스크 요인", ""]
    for r in narrative["risks"]:
        lines.append(f"- {r}")
    lines += ["", "---", "", f"> {DISCLAIMER}"]
    return "\n".join(lines)
