"""엔진이 쓰는 글 — 계산 결과를 «읽는 글»로 옮겨 blog_posts 에 넣는다.

2026-08-24 Victor: "매일 브리프, 주간 브리프, 최근 기업 분석 → 블로그 형태로 글을
올리도록 하자. 단 자동으로 콘텐츠가 배포되는 시스템을 만들어야 한다."

## 세 가지 원칙

1. **LLM 을 쓰지 않는다.** 문장은 전부 규칙과 측정값에서 나온다. 환각이 원천적으로
   불가능하고, API 키가 죽어 있어도 돈다(2026-08 현재 실제로 죽어 있다).
   weekly.py 가 제목을 규칙으로 뽑는 것과 같은 판단이다.
2. **전망을 쓰지 않는다.** 모든 문장이 과거형이다. "오를 것"이 한 번 들어가면 이건
   기록이 아니라 예측이 되고, 그 순간 다른 문장까지 예측으로 읽힌다.
3. **발행자를 숨기지 않는다.** 글 끝에 «엔진이 씁니다»를 적고, 표에도 author_kind 로
   남긴다. 블로그의 정체성은 «사람이 쓴다»이므로, 기계 글이 사람 글인 척하면
   블로그 전체의 신뢰가 깎인다.

## reports 와의 관계

reports 는 계산 결과(payload=수치)이고 여기는 그 결과를 옮긴 글이다. 이 모듈은
**새로 계산하지 않는다** — 이미 발행된 리포트를 읽어 문장으로 바꿀 뿐이다. 그래서
숫자가 화면과 글에서 갈릴 일이 없다.
"""
from __future__ import annotations

import json
from datetime import date

from engine.db import get_client, upsert
from engine.logging import get_logger
from engine.timeutil import kst_today

log = get_logger(__name__)

SOURCE_VERSION = "blog-v1"

# 기계 글은 사람 글과 같은 분류에 섞지 않는다(2026-08-24 Victor 결정).
# vecta-blog 의 `engine` 카테고리가 이 셋을 받는다.
CATEGORY = "engine"
SUB_DAILY = "daily"
SUB_WEEKLY = "weekly"
SUB_ANALYSIS = "analysis"

FOOTER = (
    "---\n\n"
    "이 글은 **VECTA 엔진이 자동으로 씁니다.** 모든 수치는 그날 종가로 계산한 것이고, "
    "문장은 그 수치에서 규칙으로 뽑았습니다. 사람의 판단과 전망은 들어 있지 않습니다."
)

# 조건부 실측을 글에 올리는 문턱 — 기준선과 이만큼(%p) 이상 차이나야 의미가 있다.
# 웹의 MarketBrief 와 같은 값을 쓴다. 두 화면이 다른 기준으로 «의미 있다»를 말하면 안 된다.
MIN_MEANINGFUL_DIFF = 3.0


# ── 작은 도구들 ────────────────────────────────────────────────────────────
def _md(as_of: str) -> str:
    """2026-08-21 → 8월 21일."""
    y, m, d = as_of.split("-")
    return f"{int(m)}월 {int(d)}일"


def _pct(x: float | None, digits: int = 2) -> str:
    if x is None:
        return "—"
    return f"{'+' if x >= 0 else ''}{x * 100:.{digits}f}%"


def _num(x) -> str:
    try:
        return f"{int(x):,}"
    except (TypeError, ValueError):
        return "—"


def _reading_minutes(body: str) -> int:
    """한국어 기준 분당 500자. 짧아도 1분으로 적는다 — 0분은 «글이 아니다»로 읽힌다."""
    return max(1, round(len(body) / 500))


def _latest_report(report_type: str, as_of: str | None) -> dict | None:
    q = (
        get_client().table("reports")
        .select("id,as_of,title,summary,payload")
        .eq("report_type", report_type)
        .eq("status", "published")
    )
    if as_of:
        q = q.eq("as_of", as_of)
    rows = (q.order("as_of", desc=True).order("id", desc=True).limit(1).execute()).data or []
    return rows[0] if rows else None


def _save(sub: str, slug: str, title: str, summary: str, body: str,
          published_at: str, refs: dict) -> dict:
    body = body.rstrip() + "\n\n" + FOOTER
    row = {
        "slug": slug,
        "category": CATEGORY,
        "sub": sub,
        "title": title,
        "summary": summary,
        "body_md": body,
        "published_at": published_at,
        "reading_minutes": _reading_minutes(body),
        "author_kind": "engine",
        "source_version": SOURCE_VERSION,
        "source_refs": json.loads(json.dumps(refs, default=str)),
        "published": True,
    }
    upsert("blog_posts", [row], on_conflict="category,sub,slug")
    log.info("blog.published", sub=sub, slug=slug, title=title)
    return {"sub": sub, "slug": slug, "title": title}


# ── 매일 브리프 ────────────────────────────────────────────────────────────
def _daily_title(md: str, mk: dict) -> str:
    """그날 가장 두드러진 사실 하나로 제목을 만든다. 전부 과거형이다."""
    ret = mk.get("market_ret")
    adv, dec = mk.get("advancers") or 0, mk.get("decliners") or 0
    total = adv + dec
    share = adv / total if total else 0.5

    if ret is not None and abs(ret) >= 0.02:
        return f"{md} 장 — 전 종목 평균 {_pct(ret)}"
    if share >= 0.7:
        return f"{md} 장 — 열 종목 중 일곱 이상이 올랐다"
    if share <= 0.3:
        return f"{md} 장 — 열 종목 중 일곱 이상이 내렸다"
    return f"{md} 장 — 오른 종목 {_num(adv)}개, 내린 종목 {_num(dec)}개"


def _conditions_md(mk: dict) -> str:
    """과거 같은 날들 — 기준선과 뚜렷이 다를 때만 쓴다.

    «차이 없음»을 길게 쓰지 않는다(2026-08-16 에 화면에서 배운 것과 같은 규칙).
    대부분의 날은 이 절이 통째로 빠지고, 특이한 날만 길어진다.
    """
    base = (mk.get("baseline") or {}).get("up_rate_1d")
    if base is None:
        return ""
    lines = []
    for c in mk.get("conditions") or []:
        up = c.get("up_rate_1d")
        if up is None or abs((up - base) * 100) < MIN_MEANINGFUL_DIFF:
            continue
        sample = c.get("sample_1d") or c.get("n") or 0
        count = c.get("up_count_1d")
        if count is None:
            count = round(up * sample)
        lines.append(
            f"- {c.get('condition')} 과거 이런 날이 **{sample}번** 있었는데, "
            f"그다음 한국 시장이 오른 건 **{count}번({up * 100:.0f}%)**이었습니다."
        )
    if not lines:
        return ""
    return (
        "## 과거 같은 날들\n\n"
        + "\n".join(lines)
        + f"\n\n아무 날이나 세면 {base * 100:.0f}% 입니다. 이 기준선보다 뚜렷이 "
        "다를 때만 적습니다.\n"
    )


def _macro_md(macro: list[dict]) -> str:
    if not macro:
        return ""
    rows = [
        f"| {m.get('label')} | {m.get('value')} | {m.get('date') or '—'} | "
        f"{_pct(m.get('change_pct')) if m.get('change_pct') is not None else '—'} |"
        for m in macro
    ]
    return (
        "## 그날의 해외 지표\n\n"
        "지표마다 발표 주기가 달라 기준일이 갈립니다. 그래서 값마다 날짜를 적습니다.\n\n"
        "| 지표 | 값 | 기준일 | 변화 |\n|---|---:|---|---:|\n" + "\n".join(rows) + "\n"
    )


def publish_daily(as_of: str | None = None) -> dict | None:
    """그날 모닝 브리프를 글로 옮긴다. 브리프가 없으면 아무것도 안 한다."""
    rep = _latest_report("market", as_of)
    if not rep:
        log.info("blog.daily.skipped_no_report", as_of=as_of)
        return None
    p = rep.get("payload") or {}
    if p.get("kind") == "outage":
        # 배치가 안 돈 날의 기록은 글이 아니다. 빈 글을 만들지 않는다.
        log.info("blog.daily.skipped_outage", as_of=rep["as_of"])
        return None

    mk = p.get("market") or {}
    nar = p.get("narrative") or {}
    day = str(rep["as_of"])
    # 장 시작 전에 쓰는 브리프라 월요일 글은 금요일 장을 담는다. 제목의 날짜는
    # **장이 열린 날**이어야 한다 — 발행일과 다르면 읽는 사람이 어느 장인지 모른다.
    market_day = str(mk.get("as_of") or day)
    md = _md(market_day)

    parts = []
    if nar.get("market_view"):
        parts.append(f"## 그날의 시장\n\n{nar['market_view']}\n")
    if mk:
        parts.append(
            "## 숫자\n\n"
            f"- 오른 종목 **{_num(mk.get('advancers'))}개** · "
            f"내린 종목 **{_num(mk.get('decliners'))}개**\n"
            f"- 전 종목 평균 **{_pct(mk.get('market_ret'))}**\n"
            f"- 집계 대상 {_num(mk.get('instruments'))}종목 · 기준일 {market_day}\n"
        )
    cond = _conditions_md(mk)
    if cond:
        parts.append(cond)
    wp = nar.get("watchpoints") or []
    if wp:
        parts.append(
            "## 그날 적어둔 관전 포인트\n\n"
            + "\n".join(f"- {w}" for w in wp)
            + "\n\n다음 거래일 플랜의 전제로 적은 것입니다. 지금 시점의 지시가 아닙니다.\n"
        )
    macro_md = _macro_md(p.get("macro") or [])
    if macro_md:
        parts.append(macro_md)

    body = "\n".join(parts)
    if not body.strip():
        log.info("blog.daily.skipped_empty", as_of=day)
        return None

    return _save(
        SUB_DAILY,
        f"brief-{day}",
        _daily_title(md, mk),
        nar.get("headline") or rep.get("summary") or f"{md} 장 기록",
        body,
        day,
        {"report_id": rep.get("id"), "market_as_of": market_day},
    )


# ── 주간 브리핑 ────────────────────────────────────────────────────────────
def publish_weekly(as_of: str | None = None) -> dict | None:
    """주간 브리핑을 글로 옮긴다. 제목은 이미 규칙으로 뽑혀 있으므로 그대로 쓴다."""
    rep = _latest_report("weekly", as_of)
    if not rep:
        log.info("blog.weekly.skipped_no_report", as_of=as_of)
        return None
    p = rep.get("payload") or {}
    start, end = p.get("week_start"), str(rep["as_of"])
    flows = p.get("flows") or {}
    macro = p.get("macro") or {}

    parts = [
        f"## 이번 주에 달라진 것\n\n{rep.get('summary') or ''}\n",
        "## 숫자\n\n"
        f"- 주간 시장 수익률 **{_pct(p.get('market_ret'))}**\n"
        f"- 거래일 {len(p.get('sessions') or [])}일 ({start} ~ {end})\n"
        f"- 그 주에 발행한 픽 **{_num(p.get('picks_issued'))}건**\n",
    ]

    flow_lines = []
    for who, label in (("foreign", "외국인"), ("institution", "기관")):
        f = flows.get(who) or {}
        if not f:
            continue
        weeks = f.get("streak_weeks")
        side = f.get("side")
        if weeks and side:
            word = "순매수" if side == "buy" else "순매도"
            flow_lines.append(f"- {label}이 **{weeks}주째 {word}** 중입니다.")
    if flow_lines:
        parts.append("## 수급\n\n" + "\n".join(flow_lines) + "\n")

    macro_lines = [
        f"- {k}: **{_pct(v)}**" for k, v in macro.items() if isinstance(v, (int, float))
    ]
    if macro_lines:
        parts.append("## 매크로 주간 변화\n\n" + "\n".join(macro_lines) + "\n")

    body = "\n".join(parts)
    return _save(
        SUB_WEEKLY,
        f"weekly-{end}",
        str(rep.get("title") or f"{_md(end)}까지의 한 주"),
        str(rep.get("summary") or ""),
        body,
        end,
        {"report_id": rep.get("id"), "week_start": start},
    )


# ── 기업 분석 ──────────────────────────────────────────────────────────────
# 종목당 한 편씩 쓰면 하루 100편이 넘는다(8/21 기준 181건). 그건 블로그가 아니라
# 덤프다. 그날 분석 중 «지금 살 수 있는 것»만 골라 **하루 한 편**으로 묶는다.
ANALYSIS_LIMIT = 8


def publish_analysis(as_of: str | None = None) -> dict | None:
    client = get_client()
    day = as_of
    if not day:
        rows = (
            client.table("reports").select("as_of")
            .eq("report_type", "indepth").eq("status", "published")
            .order("as_of", desc=True).limit(1).execute()
        ).data or []
        if not rows:
            log.info("blog.analysis.skipped_no_report")
            return None
        day = str(rows[0]["as_of"])

    def _fetch(rating: str | None) -> list[dict]:
        q = (
            client.table("reports")
            .select("id,title,summary,rating,as_of,instruments(symbol,name)")
            .eq("report_type", "indepth").eq("status", "published").eq("as_of", day)
        )
        if rating:
            q = q.eq("rating", rating)
        return (q.limit(500).execute()).data or []

    rows = _fetch("매수")
    if not rows:
        log.info("blog.analysis.skipped_no_buy", as_of=day)
        return None
    # 그날 «전체 분석 몇 건 중 매수 몇 건»을 적으려면 두 수가 다 필요하다.
    # 처음엔 매수만 세고 둘 다 그 수로 적어 "17건 중 17건"이 됐다(2026-08-24).
    total = len(_fetch(None))

    picked = rows[:ANALYSIS_LIMIT]
    md = _md(day)
    lines = []
    for r in picked:
        inst = r.get("instruments") or {}
        name = inst.get("name") or "—"
        sym = inst.get("symbol") or ""
        summary = (r.get("summary") or "").strip()
        lines.append(f"### {name} ({sym})\n\n{summary}\n")

    body = (
        f"## {md} 분석에서 «매수»가 나온 종목\n\n"
        f"이 날 발행한 종목 분석 {total}건 가운데 등급이 «매수»인 것은 "
        f"**{len(rows)}건**입니다. 그중 {len(picked)}건을 아래에 옮깁니다.\n\n"
        "등급은 시그널·팩터·밸류에이션 점수를 합쳐 규칙으로 매긴 것이고, "
        "매수 등급이 곧 매수 권유는 아닙니다. 진입가·손절가가 붙은 실행 계획은 "
        "「오늘의 픽」이고, 그건 백테스트 게이트를 따로 통과해야 나갑니다.\n\n"
        + "\n".join(lines)
    )
    return _save(
        SUB_ANALYSIS,
        f"analysis-{day}",
        f"{md} 분석 — «매수» {len(rows)}건",
        f"{md}자 종목 분석 {total}건 가운데 «매수» {len(rows)}건을 한자리에 모았습니다.",
        body,
        day,
        {"report_ids": [r.get("id") for r in picked], "buy_total": len(rows),
         "analysis_total": total},
    )


def publish_all(as_of: str | None = None) -> dict:
    """배치가 부르는 입구. 하나가 실패해도 나머지는 나간다 — 글은 서로 독립이다."""
    out: dict[str, dict | None] = {}
    for name, fn in (
        ("daily", publish_daily),
        ("weekly", publish_weekly),
        ("analysis", publish_analysis),
    ):
        try:
            out[name] = fn(as_of)
        except Exception as e:  # noqa: BLE001 — 글 하나 때문에 배치를 죽이지 않는다
            log.warning("blog.publish_failed", kind=name, error=str(e)[:200])
            out[name] = None
    log.info("blog.publish_all.done", published=[k for k, v in out.items() if v])
    return out
