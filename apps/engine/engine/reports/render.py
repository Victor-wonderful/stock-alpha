"""리포트 렌더링 — 컨텍스트(+서술) → body_md / summary. 순수 함수."""
from __future__ import annotations
from engine.signals.axes import SETUP_LABELS
from engine.signals.horizons import HORIZON_LABELS

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



# 팩터 z 키 → 한국어. 서술에 그대로 쓴다.
_FACTOR_KO = {
    "momentum_z": "모멘텀",
    "value_z": "밸류",
    "quality_z": "퀄리티",
    "growth_z": "성장",
    "lowvol_z": "저변동성",
    "size_z": "사이즈",
}


def _shares(v: float | None) -> str:
    """순매매량 → 주식수 표기. 부호 유지.

    ⚠️ 금액이 아니라 '주식수'다. ingest/naver.py parse_frgn_table 이 네이버 금융의
    (기관,순매매량)·(외국인,순매매량) 컬럼을 긁는다. DB 주석은 "주식수 또는 금액"으로
    모호하지만 실제 수집원은 수량이다. 억원으로 환산하면 43,028주가 '+0억'이 되어
    완전히 틀린 값이 나간다(실제로 첫 구현에서 그렇게 나왔다).
    """
    if v is None:
        return "—"
    if abs(v) >= 10_000:
        return f"{v / 10_000:+,.1f}만주"
    return f"{v:+,.0f}주"


def _thesis(name: str, v: dict, fac: dict, flows: dict | None, top: dict | None) -> str:
    """한 줄 논지 — 이 종목이 '왜' 그 점수인지를 실제 수치로 말한다.

    예전엔 종목·점수만 갈아끼운 한 문장이었다:
      "{name} 종합 점수 82.0점(매수). 멀티팩터·밸류에이션·트레이더 셋업을 가중 합산한
       결정적 판정입니다."
    100종목이 전부 같은 문장이라 정보량이 사실상 0 이었다. LLM 호출이 실패하면
    이 문장이 그대로 발행되는데(2026-08-14 배치는 90건 전원 reports.llm.error),
    폴백이 초라하면 실패가 곧 품질 저하로 직결된다.

    여기서 쓰는 값은 전부 코드가 계산해 payload 에 담은 것이라 환각이 원천적으로 없다
    (docs/PLAN.md '리포트 환각 차단' 원칙). 재료가 없으면 그 절만 조용히 빠진다.
    """
    parts: list[str] = [f"{name} {v['score']}점({v['rating']})"]

    # 점수 구성 — 어디서 점수가 나왔고 어디서 깎였는지가 핵심이다.
    comp = (v or {}).get("components") or {}
    wts = (v or {}).get("weights") or {}
    if comp and wts:
        seg = ", ".join(
            f"{ko} {comp[k]}/{wts[k]}"
            for k, ko in (("signal", "시그널"), ("factor", "팩터"), ("valuation", "밸류"))
            if k in comp and k in wts
        )
        if seg:
            parts.append(seg)

    # 팩터 — 무엇이 받치고 무엇이 깎았는가.
    zs = {k: fac[k] for k in _FACTOR_KO if isinstance(fac.get(k), (int, float))}
    if zs:
        best = max(zs.items(), key=lambda x: x[1])
        worst = min(zs.items(), key=lambda x: x[1])
        if best[0] != worst[0]:
            # 조사는 숫자 뒤에 붙어 받침 판정이 무의미하다 → '가/이' 대신 중립 표기.
            leg = (
                f"{_FACTOR_KO[best[0]]} {best[1]:+.2f} 우위, "
                f"{_FACTOR_KO[worst[0]]} {worst[1]:+.2f} 부담"
            )
            rank = fac.get("sector_rank")
            alpha = fac.get("composite_alpha")
            if isinstance(alpha, (int, float)):
                leg += f" → 합성알파 {alpha:+.2f}"
                if rank:
                    leg += f"(섹터 {rank}위)"
            parts.append(leg)

    # 수급 — 외국인·기관이 어느 쪽인가.
    if flows:
        fg, it = flows.get("foreign_net"), flows.get("inst_net")
        if fg is not None or it is not None:
            days = flows.get("window_days") or 20
            parts.append(f"{days}일 순매매 외국인 {_shares(fg)}·기관 {_shares(it)}")

    # 셋업 — 어떤 트리거로 잡혔는가.
    if top and top.get("setup"):
        # 손익비(R:R)를 뺐다(2026-08-23). 채택 규칙(target_action="trail")은 목표에서
        # 팔지 않는다 — 목표에 닿으면 손절만 본전으로 올린다. 그래서 (목표−진입)/(진입−손절)
        # 은 «실현되지 않는 수익»을 분자로 쓴 값이고, 화면에 적으면 사용자는 그 배수만큼
        # 번다고 읽는다. 실제로 확정된 숫자는 거는 돈(진입−손절)뿐이다.
        # 영문 키(markov)와 옛 스타일 축(position)을 그대로 찍고 있었다 —
        # 화면은 「셋업 markov(position)」을 보여줬다. 사람 말과 기간 축으로 바꾼다.
        # 라벨 사전은 engine/signals/axes·horizons 하나만 쓴다.
        setup_ko = SETUP_LABELS.get(top["setup"], top["setup"])
        hz_ko = HORIZON_LABELS.get(top.get("horizon") or "", None)
        seg = f"셋업 {setup_ko}" + (f"({hz_ko})" if hz_ko else "")
        entry, stop = top.get("entry_price"), top.get("stop_loss")
        if isinstance(entry, (int, float)) and isinstance(stop, (int, float)) and entry > stop:
            seg += f" 1주당 리스크 {round(entry - stop):,}원"
        parts.append(seg)

    return " · ".join(parts) + "."


def fallback_narrative(ctx: dict) -> dict:
    """LLM 미사용 시 결정적 템플릿 서술 — 수치 그대로 나열."""
    name = ctx["instrument"]["name"]
    v = ctx["verdict"]
    plan = ctx.get("plan") or []
    top = plan[0] if plan else None
    fac = ctx.get("factor") or {}
    bts = ctx.get("backtests") or []

    thesis = _thesis(name, v, fac, ctx.get("flows"), top)
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
    # 「위험」에는 **막는 검사**의 미통과만 적는다. 참고 항목(백테스트 게이트)을
    # 위험으로 적으면 «검증된 셋업이 없다»가 «거래하면 위험하다»로 읽힌다 —
    # 그건 발행 단계가 판단할 일이고, 시그널은 이미 그 게이트를 통과한 것만 나온다.
    risks = [
        c["label"] + " 미통과"
        for c in ctx["tradability"]["checks"]
        if not c["passed"] and c.get("blocking", c.get("key") != "backtest_gate")
    ]
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
        # 참고 항목은 판정을 막지 않는다는 것을 본문에서도 밝힌다.
        note = "" if c.get("blocking", c.get("key") != "backtest_gate") else " (참고 — 판정에 반영 안 함)"
        lines.append(f"- {mark} {c['label']}{note}")
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
