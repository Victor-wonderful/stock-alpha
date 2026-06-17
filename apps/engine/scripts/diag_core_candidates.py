"""진단(프로토타입): 장기 코어 보유 후보 — 품질 × 밸류 스크리닝.

오늘의 포커스(기술적 타이밍)와 별개로, "좋은 기업이 적정가보다 싸게 거래되는가"를
펀더멘털로 거른다. 발행이 아니라 **후보가 실제 어떻게 나오는지 데이터로 보기** 위함.

자격(코어 게이트): ROE≥8% · 영업이익률>0 · 부채비율<2 · 0<PER≤40 · upside>0
  (FCF 는 현재 DART 적재가 비어 있어 게이트에서 제외 — 적재되면 추가할 것)
순위: 자격 통과군 내 z-score 합 = z(upside)+z(roe)+z(op_margin)+z(-debt_ratio)

실행: (apps/engine, 자격증명) python -m scripts.diag_core_candidates
"""
from __future__ import annotations

import statistics as st

from engine.db import select_all
from engine.fundamental.ratios import compute_ratios


def _period_key(p: str) -> tuple:
    """'2024FY'>'2024Q4'>... 정렬키 — 연간 우선, 없으면 최근 분기."""
    p = p or ""
    year = p[:4] if p[:4].isdigit() else "0000"
    suf = p[4:]
    rank = {"FY": 5, "Q4": 4, "Q3": 3, "Q2": 2, "Q1": 1}.get(suf, 0)
    return (year, rank)


def _latest_by_instrument(rows: list[dict], key: str, sort_val) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for r in rows:
        iid = r["instrument_id"]
        cur = out.get(iid)
        if cur is None or sort_val(r) > sort_val(cur):
            out[iid] = r
    return out


def _z(xs: list[float]) -> dict[int, float]:
    """인덱스→z. (리스트 순서 기준)"""
    if len(xs) < 2:
        return {i: 0.0 for i in range(len(xs))}
    m = st.mean(xs)
    sd = st.pstdev(xs) or 1.0
    return {i: (x - m) / sd for i, x in enumerate(xs)}


def main() -> None:
    insts = {r["id"]: r for r in select_all("instruments", "id,symbol,name,active")}
    vals = _latest_by_instrument(
        select_all("valuations", "instrument_id,date,per,pbr,roe,upside_pct"),
        "date", lambda r: r.get("date") or "",
    )
    fins = _latest_by_instrument(
        select_all("financials",
                   "instrument_id,period,revenue,op_income,net_income,equity,debt"),
        "period", lambda r: _period_key(r.get("period") or ""),
    )
    print(f"instruments={len(insts)} valuations={len(vals)} financials={len(fins)}")

    cands = []
    for iid, inst in insts.items():
        if not inst.get("active"):
            continue
        v, f = vals.get(iid), fins.get(iid)
        if not v or not f:
            continue
        ratios = compute_ratios(f)
        roe = v.get("roe") if v.get("roe") is not None else ratios.get("roe")
        op_m = ratios.get("op_margin")
        debt_r = ratios.get("debt_ratio")
        per = v.get("per")
        upside = v.get("upside_pct")
        # 코어 자격 게이트 — 좋은 기업 + 싸게 (FCF 미적재로 제외)
        if None in (roe, op_m, debt_r, per, upside):
            continue
        # 코어 자격(밸류에이션 v2 가드로 데이터 정리됨 → 인위적 상한 불필요).
        if not (roe >= 0.10 and op_m > 0.05 and 0 <= debt_r < 1.5
                and 5 <= per <= 40 and upside > 0):
            continue
        cands.append({
            "iid": iid, "symbol": inst["symbol"], "name": inst.get("name") or "",
            "upside": float(upside), "roe": float(roe), "op_m": float(op_m),
            "debt_r": float(debt_r), "per": float(per),
        })

    if not cands:
        print("\n자격 통과 후보 0 — valuations/financials 적재가 부족할 수 있음.")
        return

    # z-score 합산 순위
    zu = _z([c["upside"] for c in cands])
    zr = _z([c["roe"] for c in cands])
    zm = _z([c["op_m"] for c in cands])
    zd = _z([-c["debt_r"] for c in cands])
    for i, c in enumerate(cands):
        c["score"] = zu[i] + zr[i] + zm[i] + zd[i]
    cands.sort(key=lambda c: c["score"], reverse=True)

    print(f"\n자격 통과 {len(cands)}종목 · 상위 25 (품질×밸류 복합)\n")
    print(f"{'#':>2} {'symbol':8} {'name':18} {'score':>6} "
          f"{'upside%':>8} {'ROE%':>6} {'영업이익률%':>10} {'부채비율':>8} {'PER':>6}")
    print("-" * 88)
    for rank, c in enumerate(cands[:25], 1):
        print(f"{rank:>2} {c['symbol']:8} {c['name'][:18]:18} {c['score']:>6.2f} "
              f"{c['upside']*100:>7.1f} {c['roe']*100:>6.1f} {c['op_m']*100:>9.1f} "
              f"{c['debt_r']:>8.2f} {c['per']:>6.1f}")


if __name__ == "__main__":
    main()
