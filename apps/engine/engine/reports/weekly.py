"""주간 브리핑 (report_type='weekly') — 한 주를 한 문장으로.

홈의 「주간 브리핑」 섹션이 읽는 산출물이다. 매일 아침 시황(morning, 'market')이
«어제 무슨 일이 있었나»라면, 이것은 «이번 주에 무엇이 달라졌나»다.

## 제목을 규칙으로 뽑는 이유

블로그의 주간 브리핑은 사람이 쓴 글이라 제목이 주제다("외국인이 3주째 팔고 있다").
기계가 그런 제목을 내려면 LLM 이 쓰거나, 측정값에서 규칙으로 뽑거나 둘 중 하나다.
여기서는 **규칙**을 쓴다:

- 모든 제목이 그 주에 실제로 잰 값에서 나온다. 환각이 원천적으로 불가능하다.
- LLM 이 없어도 돈다(2026-08 현재 API 키가 죽어 있어 서술이 전부 템플릿 폴백이다).
- "감이 아니라 근거로"라는 이 제품의 약속과 같은 방향이다.

⚠️ 전망을 쓰지 않는다. 여기 나오는 모든 문장은 **과거형**이다. "오를 것"류 표현이
들어가면 그 순간 이건 브리핑이 아니라 예측이 된다.

## 무엇을 재나

시장 수익률 · 상승종목 비중(브레드스) · 외국인/기관 주간 순매수와 연속 주수 ·
VIX/금리/환율 주간 변화 · 레짐 전환 · 그 주에 발행한 픽 수.

픽 «성적»은 넣지 않는다. 손절은 평균 5.9일에 확정되는데 이기는 픽은 아직 진행중이라,
지금 어떤 기준으로 세도 검열 편향(censoring bias)이 걸린 숫자가 나온다.
"""
from __future__ import annotations

import json
from datetime import date, timedelta

from engine.db import get_client
from engine.timeutil import kst_today
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "weekly-v1"

# 제목이 될 만한 «달라짐»의 문턱. 이 아래는 그 주의 특징이라 부를 수 없다.
MIN_MARKET_MOVE = 0.02      # 주간 시장 수익률 ±2%
MIN_STREAK_WEEKS = 2        # 수급 연속 주수
MIN_VIX_MOVE = 0.15         # VIX 주간 변화율 ±15%
BREADTH_MID = 0.5           # 상승종목 비중의 과반 경계


def _week_bounds(as_of: str) -> tuple[str, str]:
    """as_of 가 속한 주의 월요일~as_of. 주 중간에 돌려도 그 주를 가리킨다."""
    d = date.fromisoformat(as_of)
    monday = d - timedelta(days=d.weekday())
    return monday.isoformat(), d.isoformat()


def _sessions(start: str, end: str) -> list[dict]:
    """구간의 거래일별 시장 요약 — 매일 아침 시황이 payload 에 남긴 것을 재사용한다.

    payload.market.as_of 가 «그 시황이 설명하는 장»이다(발행일 as_of 와 다르다 —
    아침 배치는 직전 장을, 그날 16:30 일일 배치는 그날 장을 쓴다). 장 기준으로 접는다.
    """
    rows = (
        get_client().table("reports")
        .select("as_of,payload")
        .eq("report_type", "market").eq("status", "published")
        .gte("as_of", start).lte("as_of", (date.fromisoformat(end) + timedelta(days=1)).isoformat())
        .order("as_of", desc=True).order("id", desc=True)
        .execute()
    ).data or []
    by_session: dict[str, dict] = {}
    for r in rows:
        p = r.get("payload") or {}
        mk = p.get("market") or {}
        session = mk.get("as_of")
        if not session or session < start or session > end:
            continue
        if session in by_session:      # 최신 발행본이 이긴다
            continue
        by_session[session] = {
            "date": session,
            "advancers": mk.get("advancers"),
            "decliners": mk.get("decliners"),
            "breadth": mk.get("breadth"),
            "market_ret": mk.get("market_ret"),
            "regime": (p.get("regime") or {}).get("regime"),
        }
    return [by_session[k] for k in sorted(by_session)]


def _flow_streak(week_start: str, weeks_back: int = 8) -> dict:
    """이번 주 포함 과거 몇 주의 수급 방향 → 연속 주수.

    「3주째 팔고 있다」는 이 제품이 실제로 잴 수 있는 몇 안 되는 «이야기»다.
    """
    from engine import db_direct

    if not db_direct.available():
        return {}
    start = (date.fromisoformat(week_start) - timedelta(weeks=weeks_back)).isoformat()
    end = (date.fromisoformat(week_start) + timedelta(days=6)).isoformat()
    try:
        by_date = db_direct.flows_by_date(start, end)
    except Exception as exc:  # noqa: BLE001 — 수급은 부가 정보, 브리핑을 죽이지 않는다
        log.warning("weekly.flows.failed", error=str(exc))
        return {}
    if not by_date:
        return {}

    # 주(월요일) 단위로 접기
    weekly: dict[str, dict[str, float]] = {}
    for d, v in by_date.items():
        dd = date.fromisoformat(d)
        monday = (dd - timedelta(days=dd.weekday())).isoformat()
        acc = weekly.setdefault(monday, {"foreign": 0.0, "institution": 0.0})
        acc["foreign"] += v["foreign"]
        acc["institution"] += v["institution"]

    order = sorted(weekly, reverse=True)          # 최신 주부터
    if week_start not in weekly:
        return {}
    out: dict = {
        "foreign_net": weekly[week_start]["foreign"],
        "institution_net": weekly[week_start]["institution"],
    }
    for who in ("foreign", "institution"):
        sign = 1 if weekly[week_start][who] > 0 else -1 if weekly[week_start][who] < 0 else 0
        streak = 0
        if sign:
            for wk in order:
                if wk > week_start:
                    continue
                v = weekly[wk][who]
                if (v > 0) == (sign > 0) and v != 0:
                    streak += 1
                else:
                    break
        out[f"{who}_streak"] = streak
        out[f"{who}_dir"] = "순매수" if sign > 0 else "순매도" if sign < 0 else None
    return out


def _macro_week(start: str, end: str) -> dict:
    """주 초 대비 주 말 변화. FRED 는 며칠 지연되므로 구간 내 첫/마지막 값을 쓴다."""
    client = get_client()
    out: dict = {}
    for sid, key in (("VIXCLS", "vix"), ("DGS10", "ust10y"), ("DEXKOUS", "usdkrw")):
        rows = (
            client.table("macro").select("date,value")
            .eq("series_id", sid).gte("date", start).lte("date", end)
            .order("date").execute()
        ).data or []
        if len(rows) < 2:
            continue
        first, last = float(rows[0]["value"]), float(rows[-1]["value"])
        out[key] = {
            "first": first, "last": last, "as_of": rows[-1]["date"],
            "change": last - first,
            "change_pct": (last / first - 1) if first else None,
        }
    return out


def _picks_issued(start: str, end: str) -> int:
    rows = (
        get_client().table("recommendations").select("as_of")
        .eq("basket_type", "daily_focus").gte("as_of", start).lte("as_of", end)
        .execute()
    ).data or []
    return len(rows)


def _pct(x: float) -> str:
    return f"{x * 100:+.1f}%"


def build_headline(ctx: dict) -> tuple[str, str]:
    """(제목, 한 줄 설명). 규칙 우선순위대로 «가장 달라진 것»을 제목으로 올린다.

    전부 과거형이다. 전망으로 읽힐 여지를 남기지 않는다.
    """
    sessions = ctx["sessions"]
    flows = ctx["flows"]
    macro = ctx["macro"]
    ret = ctx.get("market_ret")
    facts: list[str] = []

    # 설명 줄에 쓸 재료를 먼저 모은다(제목으로 쓰인 것은 나중에 뺀다).
    if ret is not None:
        facts.append(f"시장은 한 주 동안 {_pct(ret)} 움직였습니다")
    if sessions:
        last = sessions[-1]
        if last.get("breadth") is not None:
            facts.append(f"마지막 거래일 상승 종목 비중은 {last['breadth'] * 100:.0f}%였습니다")
    if macro.get("vix") and macro["vix"].get("change_pct") is not None:
        facts.append(f"VIX 는 {_pct(macro['vix']['change_pct'])} 변했습니다")
    if ctx.get("picks_issued"):
        facts.append(f"이번 주 추천은 {ctx['picks_issued']}건이었습니다")

    def done(title: str, used: str | None) -> tuple[str, str]:
        rest = [f for f in facts if used is None or used not in f]
        return title, " · ".join(rest[:3]) + ("." if rest else "")

    # ① 수급 연속 — 이 제품이 잴 수 있는 가장 «이야기»에 가까운 사실
    for who, label in (("foreign", "외국인"), ("institution", "기관")):
        streak = flows.get(f"{who}_streak") or 0
        direction = flows.get(f"{who}_dir")
        if streak >= MIN_STREAK_WEEKS and direction:
            return done(f"{label}이 {streak}주째 {direction} 중입니다", None)

    # ② 시장이 크게 움직인 주
    if ret is not None and abs(ret) >= MIN_MARKET_MOVE:
        word = "올랐습니다" if ret > 0 else "내렸습니다"
        return done(f"시장이 한 주 만에 {_pct(ret)} {word}", "시장은 한 주 동안")

    # ③ 공포지수가 크게 변한 주
    vix = macro.get("vix") or {}
    if vix.get("change_pct") is not None and abs(vix["change_pct"]) >= MIN_VIX_MOVE:
        word = "올랐습니다" if vix["change_pct"] > 0 else "내렸습니다"
        return done(
            f"공포지수(VIX)가 한 주 만에 {_pct(vix['change_pct'])} {word}", "VIX 는"
        )

    # ④ 상승 종목 비중이 과반 경계를 넘나든 주
    if len(sessions) >= 2:
        first_b, last_b = sessions[0].get("breadth"), sessions[-1].get("breadth")
        if first_b is not None and last_b is not None:
            if first_b < BREADTH_MID <= last_b:
                return done("오른 종목이 주중에 과반으로 돌아섰습니다", "마지막 거래일")
            if last_b < BREADTH_MID <= first_b:
                return done("오른 종목이 주중에 과반 아래로 내려갔습니다", "마지막 거래일")

    # ⑤ 레짐이 바뀐 주
    regimes = [s.get("regime") for s in sessions if s.get("regime")]
    if len(set(regimes)) > 1 and regimes:
        label = {"risk_on": "위험선호", "risk_off": "위험회피", "neutral": "중립"}
        return done(f"시장 국면이 {label.get(regimes[-1], regimes[-1])}로 바뀌었습니다", None)

    # ⑥ 아무것도 두드러지지 않은 주 — 그 사실 자체를 말한다
    return done("특별히 달라진 것이 없는 한 주였습니다", None)


def build_context(as_of: str | None = None) -> dict:
    today = as_of or kst_today().isoformat()
    start, end = _week_bounds(today)
    sessions = _sessions(start, end)

    # 주간 시장 수익률 — 거래일별 시장 수익률의 누적(복리)
    ret = None
    daily = [s["market_ret"] for s in sessions if s.get("market_ret") is not None]
    if daily:
        acc = 1.0
        for r in daily:
            acc *= 1 + float(r)
        ret = acc - 1

    return {
        "week_start": start,
        "week_end": end,
        "sessions": sessions,
        "market_ret": ret,
        "flows": _flow_streak(start),
        "macro": _macro_week(start, end),
        "picks_issued": _picks_issued(start, end),
    }


def publish(as_of: str | None = None) -> dict:
    """주간 브리핑 1건 발행. 같은 주는 덮어쓴다(주중에 여러 번 돌아도 1건)."""
    ctx = build_context(as_of)
    headline, summary = build_headline(ctx)
    week_end = ctx["week_end"]

    client = get_client()
    # NULL instrument_id 는 유니크 인덱스 충돌 매칭이 안 된다 → delete-insert
    # (morning.py 와 같은 이유). 같은 주의 이전 발행분을 지우고 다시 넣는다.
    client.table("reports").delete().eq("report_type", "weekly").gte(
        "as_of", ctx["week_start"]
    ).lte("as_of", week_end).execute()

    row = {
        "report_type": "weekly",
        "as_of": week_end,
        "status": "published",
        "title": headline,
        "summary": summary,
        "payload": json.loads(json.dumps(ctx, default=str)),
        # reports 에는 source_version 컬럼이 없다 — morning 과 같이 model_version 을 쓴다.
        "model_version": f"rules+{SOURCE_VERSION}",
    }
    client.table("reports").insert(row).execute()
    log.info(
        "reports.weekly.published",
        week=f"{ctx['week_start']}~{week_end}",
        sessions=len(ctx["sessions"]),
        headline=headline,
    )
    return {"as_of": week_end, "headline": headline, "summary": summary}
