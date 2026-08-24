"""모닝 브리프 (report_type='market') — 장 시작 전 시장 맥락 + 오늘의 플랜 재확인.

밤사이 바뀌는 건 해외 변수(미국장·환율·VIX·유가)뿐 — 국내 가격레벨(픽)은
전일 16:30 발행분이 그대로 유효. 08:30 배치: FRED 갱신 → 레짐 → 본 브리프 1건.
하루 1건 — 같은 날 재실행 시 기존 건 삭제 후 재발행(NULL instrument_id 는
유니크 인덱스 충돌 매칭이 안 되므로 delete-insert).

as_of 는 «브리프를 언제 썼나»가 아니라 «분석이 어느 날짜까지 됐나»다 — 08:30 에
쓴 브리프의 내용은 전 거래일 종가이므로 as_of 도 그 날이다(basis_day 주석 참조).
"""
from __future__ import annotations

import json
from datetime import date

from engine.db import get_client
from engine.timeutil import kst_today
from engine.logging import get_logger
from engine.reports.llm import generate_json

log = get_logger(__name__)

SOURCE_VERSION = "morning-v1"
BRIEF_KEYS = ("headline", "market_view", "watchpoints")

SYSTEM = """당신은 한국 주식 시장 모닝 브리프를 쓰는 애널리스트입니다. \
입력 JSON 의 수치만 근거로 장 시작 전 브리프를 작성합니다.

절대 규칙:
1. JSON 에 없는 수치·사건을 만들어내지 마십시오.
2. 수익 보장·단정 표현 금지. 특정 개인 대상 표현 금지(불특정 다수 대상).
3. **시장 방향을 예측하지 마십시오.** "오를 것", "상승 전망", "반등 예상" 같은 표현을
   쓰지 마십시오. market.conditions 는 예측이 아니라 **과거 빈도**입니다 —
   "과거 같은 상황 N회 중 M%가 올랐습니다" 처럼 **과거형·표본 수 포함**으로만 쓰십시오.
4. **조건부 확률을 쓸 땐 기준선(market.baseline.up_rate_1d)을 반드시 함께** 적으십시오.
   기준선 없이 "67%"만 쓰면 시스템의 실력으로 오해됩니다 — 아무 조건 없이 세도
   절반 이상이 오르는 시장입니다.
5. 조건의 다음날 적중률이 높아도 avg_ret 이 기준선보다 낮으면 그 사실을 함께 쓰십시오
   (방향이 이어져도 폭은 줄 수 있습니다).
6. 출력은 JSON 하나만: {"headline": str, "market_view": str, "watchpoints": [str, ...]}
   - headline: 오늘 시장을 요약하는 한 문장 (수치 기반, 전망 아님)
   - market_view: 시장 폭·해외 변수·레짐·조건부 실측을 엮은 3~4문장
   - watchpoints: 오늘 픽/시장에서 주시할 점 2~4개 (각 1문장)"""


def _macro_summary() -> list[dict]:
    """시리즈별 최신값 + 직전 대비 변화."""
    from engine.ingest.fred import SERIES

    client = get_client()
    out = []
    for sid, label in SERIES.items():
        rows = (
            client.table("macro").select("date,value")
            .eq("series_id", sid).order("date", desc=True).limit(2).execute()
        ).data or []
        if not rows:
            continue
        last = float(rows[0]["value"])
        prev = float(rows[1]["value"]) if len(rows) > 1 else None
        out.append({
            "series": sid, "label": label, "date": rows[0]["date"],
            "value": last,
            "change_pct": round(last / prev - 1, 4) if prev else None,
        })
    return out


def basis_day() -> str:
    """분석 기준일 — «봉이 마지막으로 쌓인 거래일». 달력의 오늘이 아니다.

    2026-08-24 사고: 여기서 kst_today() 를 쓰는 바람에 08:30 모닝 배치가 «오늘
    날짜»로 브리프를 찍었다. 그 시각엔 그날 봉이 없어 내용은 전 거래일 종가 이야기
    (시장 폭·픽·레짐 전부)인데 라벨만 오늘이었다. 홈은 그 날짜로 픽을 걸러
    «발행 없음»을 띄웠고, 시장 페이지는 8/21 숫자에 «8월 24일 기준»을 달았다.

    EOD 배치는 as_of 를 명시해 넘기므로(reports/daily.py) 이 함수를 타지 않는다 —
    이건 as_of 없이 도는 모닝 배치의 기준일이다. 일일 배치의 신선도 가드가 쓰는
    바로 그 market_latest 를 쓴다(engine.freshness). 미래 날짜 봉이 하나라도 섞이면
    기준일이 앞서 나가므로 오늘로 자른다.
    """
    today = kst_today().isoformat()
    try:
        from engine import db_direct, freshness
        if db_direct.available():
            latest = freshness.assess_dates(
                db_direct.latest_bar_date_by_iid(), today
            )["market_latest"]
            if latest:
                return min(str(latest), today)
    except Exception as e:  # noqa: BLE001 — 기준일 하나 때문에 브리프를 죽이지 않는다
        log.warning("reports.morning.basis_day_failed", error=str(e)[:140])
    # 직접 PG 가 없는 환경(웹 호스팅 등) 폴백 — 마지막으로 «분석이 된» 날.
    # 웹 화면들이 기준일로 쓰는 값과 같은 것이다(lib/data.getLatestReportDay).
    try:
        rows = (
            get_client().table("reports").select("as_of")
            .eq("report_type", "indepth").eq("status", "published")
            .lte("as_of", today).order("as_of", desc=True).limit(1).execute()
        ).data or []
        if rows:
            return str(rows[0]["as_of"])
    except Exception as e:  # noqa: BLE001
        log.warning("reports.morning.basis_day_fallback_failed", error=str(e)[:140])
    return today


def build_context(as_of: str | None = None) -> dict:
    client = get_client()
    today = as_of or basis_day()
    regime = (
        client.table("market_regime").select("*")
        .lte("date", today)
        .order("date", desc=True).limit(1).execute()
    ).data or [None]
    # 브리프 시점(as_of) 이하 최신 픽만 참조 — EOD 갱신 시 그날 픽, 아침엔 전일 픽.
    # 카드(오늘의 포커스)와 같은 픽 집합을 가리켜 브리프↔카드 불일치를 막는다.
    picks = (
        client.table("recommendations")
        .select("as_of,style,entry_price,target_price,stop_loss,thesis,"
                "instruments(symbol,name)")
        .eq("basket_type", "daily_focus")
        .lte("as_of", today)
        .order("as_of", desc=True).limit(10).execute()
    ).data or []
    latest_pick_day = picks[0]["as_of"] if picks else None
    picks = [p for p in picks if p["as_of"] == latest_pick_day]

    reports = (
        client.table("reports").select("rating,as_of")
        .eq("report_type", "indepth").eq("status", "published")
        .order("as_of", desc=True).limit(150).execute()
    ).data or []
    latest_rep_day = reports[0]["as_of"] if reports else None
    dist: dict[str, int] = {}
    for r in reports:
        if r["as_of"] == latest_rep_day:
            dist[r["rating"]] = dist.get(r["rating"], 0) + 1

    # 시장 폭 + 조건부 실측 — 시황을 '전망'이 아니라 '과거 빈도'로 말하기 위한 재료.
    # 실패해도 브리프를 죽이지 않는다(직접 PG 불가 등) — 그 블록만 빠진다.
    try:
        from engine.market import breadth as _breadth
        market = _breadth.build(today)
    except Exception as e:  # noqa: BLE001
        log.warning("reports.morning.breadth_failed", error=str(e)[:140])
        market = None

    return {
        "as_of": today,
        "regime": regime[0],
        "market": market,
        "macro": _macro_summary(),
        "picks": [
            {
                "symbol": (p.get("instruments") or {}).get("symbol"),
                "name": (p.get("instruments") or {}).get("name"),
                "style": p.get("style"),
                "entry_price": p.get("entry_price"),
                "target_price": p.get("target_price"),
                "stop_loss": p.get("stop_loss"),
            }
            for p in picks
        ],
        "rating_distribution": dist,
    }


def _condition_sentence(c: dict, base: dict) -> str:
    """조건 1건을 '과거 빈도' 문장으로.

    조건 라벨(breadth.CONDITIONS)이 이미 완결 문장이라 그대로 이어 붙인다.
    비율만 말하지 않고 **횟수를 함께** 쓴다 — 사람은 "55번 중 21번"을 더 잘 센다.
    기준선을 반드시 함께 — 없으면 시스템 실력으로 읽힌다.
    """
    up = c.get("up_rate_1d")
    b1 = base.get("up_rate_1d")
    n = c.get("sample_1d") or c.get("n")
    cnt = c.get("up_count_1d")
    if up is None or b1 is None or not n:
        return f"{c['condition']} (과거 {c['n']}번)"
    if cnt is None:
        cnt = round(up * n)
    diff = (up - b1) * 100
    tail = ("아무 날이나 세는 것과 별 차이가 없습니다" if abs(diff) < 3
            else "평소보다 " + ("높습니다" if diff > 0 else "낮습니다"))
    return (f"{c['condition']} 과거 이런 날이 {n}번 있었는데, 그다음 한국 시장이 오른 건 "
            f"{cnt}번({up*100:.0f}%)이었습니다. 아무 날이나 세면 {b1*100:.0f}% — {tail}.")


def fallback_brief(ctx: dict) -> dict:
    """LLM 없이도 '오늘'을 말하는 브리프.

    이전 폴백은 레짐 라벨 + 픽 개수뿐이라 5일 연속 같은 문장이 나갔다
    ("시장 레짐 위험선호 — 오늘의 포커스 5종목 플랜 유지."). 매일 바뀌는 수치
    (시장 폭·조건부 빈도)를 넣어 폴백만으로도 내용이 서게 한다.
    """
    rg = ctx.get("regime") or {}
    label = {"risk_on": "위험선호", "neutral": "중립", "risk_off": "위험회피"}.get(
        rg.get("regime", ""), "판단 보류"
    )
    picks = ctx.get("picks") or []
    mk = ctx.get("market") or {}

    if mk:
        up, dn = mk.get("advancers"), mk.get("decliners")
        headline = (f"오른 종목이 {up:,}개, 내린 종목이 {dn:,}개였습니다. "
                    f"시장 레짐 {label}, 다음 거래일 플랜 {len(picks)}종목.")
        base = mk.get("baseline") or {}
        conds = mk.get("conditions") or []
        view = [f"전 종목 평균 {mk['market_ret']*100:+.2f}%."]
        view += [_condition_sentence(c, base) for c in conds]
        if not conds:
            view.append("과거와 뚜렷하게 다른 점은 없는 날입니다.")
        market_view = " ".join(view)
    else:
        headline = f"시장 레짐 {label} — 오늘의 포커스 {len(picks)}종목 플랜 유지."
        market_view = " · ".join(rg.get("drivers") or []) or "레짐 데이터 없음."

    return {
        "headline": headline,
        "market_view": market_view,
        "watchpoints": [
            f"{p['name']} 진입 {p['entry_price']:,.0f}원 / 손절 {p['stop_loss']:,.0f}원"
            for p in picks if p.get("entry_price") and p.get("stop_loss")
        ] or ["오늘 기준 통과 픽 없음 — 신규 진입 관망."],
    }


def publish_morning(*, use_llm: bool = True, as_of: str | None = None) -> dict:
    """모닝 브리프 발행 — 같은 날(as_of) 기존 건 교체.

    as_of 미지정 시 오늘. 데일리 EOD 배치가 픽 확정 후 같은 as_of 로 호출해 브리프가
    그날 픽을 가리키게 한다(저녁~다음날 아침 브리프↔카드 불일치 방지).
    """
    ctx = build_context(as_of)
    narrative = (
        generate_json(
            SYSTEM,
            "다음 데이터만 근거로 모닝 브리프 JSON 을 작성하세요.\n\n"
            + json.dumps(ctx, ensure_ascii=False, default=str),
            BRIEF_KEYS,
        )
        if use_llm else None
    )
    llm_used = narrative is not None
    if narrative is None:
        narrative = fallback_brief(ctx)
    if not isinstance(narrative.get("watchpoints"), list):
        narrative["watchpoints"] = [str(narrative.get("watchpoints", ""))]

    today = ctx["as_of"]
    body_md = "\n".join([
        f"# 모닝 브리프 — {today}",
        "", narrative["headline"], "", narrative["market_view"], "",
        "## 오늘 주시할 점", "",
        *[f"- {w}" for w in narrative["watchpoints"]],
    ])
    client = get_client()
    # NULL instrument_id 는 유니크 매칭이 안 되므로 delete-insert 로 하루 1건 유지
    client.table("reports").delete().eq("report_type", "market").eq(
        "as_of", today
    ).execute()
    client.table("reports").insert({
        "report_type": "market",
        "title": f"모닝 브리프 — {today}",
        "as_of": today,
        "status": "published",
        "summary": narrative["headline"],
        "body_md": body_md,
        "payload": {**ctx, "narrative": narrative},
        "model_version": ("llm" if llm_used else "template") + f"+{SOURCE_VERSION}",
    }).execute()
    log.info("reports.morning.published", llm=llm_used, picks=len(ctx["picks"]))
    return {"llm": llm_used, "headline": narrative["headline"]}
