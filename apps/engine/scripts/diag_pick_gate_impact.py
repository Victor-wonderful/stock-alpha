"""진단: select_picks 게이트 적용 전/후 픽 변화를 최근 발행일 기준으로 비교.

before = 게이트 미적용(기존 동작), after = passed_combos 주입(신규).
어떤 종목이 유지/탈락/스타일변경 되는지 보여준다 — 발행 전 영향 점검용.

실행: (apps/engine 에서, 워크트리 코드 + 자격증명)
  PYTHONPATH=<worktree>/apps/engine python -m scripts.diag_pick_gate_impact
"""
from __future__ import annotations

from engine.backtest.runner import passed_combos_from_db
from engine.db import get_client, select_all
from engine.reports.daily import gate_expectancy_from_db, select_picks


def main() -> None:
    client = get_client()
    # 최근 발행(indepth/published) as_of 1일 선택
    recent = (
        client.table("reports")
        .select("as_of")
        .eq("report_type", "indepth").eq("status", "published")
        .order("as_of", desc=True).limit(1).execute()
    ).data
    if not recent:
        print("발행된 indepth 리포트 없음.")
        return
    as_of = recent[0]["as_of"]
    rows = (
        client.table("reports")
        .select("instrument_id,as_of,summary,payload")
        .eq("report_type", "indepth").eq("status", "published").eq("as_of", as_of)
        .execute()
    ).data or []

    sym = {r["id"]: r["symbol"] for r in select_all("instruments", "id,symbol")}
    combos = passed_combos_from_db()
    print(f"기준 발행일 as_of={as_of}  리포트 {len(rows)}건")
    print(f"게이트 통과 조합(setup→styles): {combos}\n")

    exp = gate_expectancy_from_db()
    before = {p["instrument_id"]: p for p in select_picks(rows)}
    after = {
        p["instrument_id"]: p
        for p in select_picks(rows, passed_combos=combos, expectancy_by_combo=exp)
    }

    def fmt(p):
        return f"{sym.get(p['instrument_id'], p['instrument_id'])}({p.get('setup')}/{p['style']})"

    print(f"{'before(게이트 미적용)':30} {'after(게이트 적용)':30} 판정")
    print("-" * 75)
    ids = list(dict.fromkeys(list(before) + list(after)))
    for iid in ids:
        b, a = before.get(iid), after.get(iid)
        if b and a:
            verdict = "유지" if b["style"] == a["style"] else f"스타일변경 {b['style']}→{a['style']}"
        elif b and not a:
            verdict = "탈락(게이트 미통과)"
        else:
            verdict = "신규편입"
        print(f"{(fmt(b) if b else '-'):30} {(fmt(a) if a else '-'):30} {verdict}")
    print(f"\nbefore {len(before)}종목 → after {len(after)}종목")


if __name__ == "__main__":
    main()
