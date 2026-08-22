"""재현: 규칙 교체 이전 픽을 «새 규칙 × 3기간»으로 다시 계산한다.

2026-08-22 에 매매 규칙을 바꿨다 — 지정가 진입 → **다음 거래일 시가**, 스타일 축 →
**기간 축**(5/10/20일), 목표에서 전량 매도 → **목표는 본전스톱 트리거**. 그런데 그
이전에 발행된 픽 43건은 전부 옛 규칙 기록이라 새 성과 화면(기간별)에 아무것도 안 뜬다.

이 스크립트는 그 43건을 실제 과거 시세로 다시 돌려 `basket_type='resim_horizon'` 에
넣는다. **발행 기록(daily_focus)은 건드리지 않는다** — 사후에 고치면 트랙레코드가
거짓말이 된다. 재현은 언제든 다시 계산할 수 있는 «백테스트»이고, 발행 기록은 그날
실제로 내보낸 «약속»이다. 둘을 섞지 않는다(0039 주석 참조).

## 왜 기간을 «하나 고르지» 않는가

signals/generate.py 는 게이트를 통과한 **모든 기간에 각각** 시그널을 낸다. 그래서
재현도 픽 1건 → 기간 3벌로 펼친다(43 → 129행). 첫 판에서 «기대값 최고 기간 하나»를
골랐더니 median·kalman·markov·ensemble 이 전부 장기로 몰렸다 — 이 셋업들은 기간이
길수록 기대값이 높다. 그러면 8월 발행분이 20거래일을 못 채워 죄다 '진행 중'이 되고
성과가 사라진다. 축을 접은 게 문제였다.

## 재현의 한계 (정직하게)

  · 구조 손절(지지/저항 당김)은 재현 못 한다 — 당시 support/resistance 가 픽 행에
    저장돼 있지 않다. ATR 손절만 쓴다.
  · 129개 조합 중 **현 게이트를 통과하는 건 2개뿐**이다. 나머지는 «새 규칙이었다면
    이랬을 것»이지 «발행됐을 것»이 아니다. gate_pass 를 conviction 자리에 실어
    화면이 구분할 수 있게 한다.

실행 (apps/engine 에서):
    python -m scripts.resim_picks_horizon                     # 계산만
    python -m scripts.resim_picks_horizon --apply             # resim_horizon 에 적재
    python -m scripts.resim_picks_horizon --backup out.json   # 원본 백업도
"""
from __future__ import annotations

import argparse
import json
from datetime import date

import pandas as pd

from engine.backtest.runner import passed_combos_from_db
from engine.db import get_client, select_all, upsert
from engine.logging import get_logger
from engine.reports.daily import resolve_pick_status
from engine.signals.horizons import HORIZON_STYLE, HORIZONS, get_profile
from engine.signals.indicators import atr as atr_series
from engine.signals.levels import compute_levels

log = get_logger(__name__)

SOURCE_BASKET = "daily_focus"      # 읽는 곳 — 실제 발행 기록
RESIM_BASKET = "resim_horizon"     # 쓰는 곳 — 재현(시뮬레이션)
RISK_PCT = 1.0                     # 권장 비중 산출용 — 수익률에는 영향 없음
LABELS = (("short", "단기 5일"), ("mid", "중기 10일"), ("long", "장기 20일"))


def load_bars(iid: int) -> pd.DataFrame:
    rows = (get_client().table("ohlcv")
            .select("ts,open,high,low,close")
            .eq("instrument_id", iid).eq("interval", "1d")
            .order("ts").limit(2000).execute()).data or []
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    for c in ("open", "high", "low", "close"):
        df[c] = df[c].astype(float)
    df["d"] = df["ts"].astype(str).str[:10]
    return df


def simulate(picks: list[dict], combos: dict[str, list[str]]) -> tuple[list, list]:
    """픽마다 3기간을 돌려 (결과행, 건너뛴것) 을 낸다."""
    today = date.today()
    out: list[dict] = []
    skipped: list[tuple[dict, str]] = []
    bars_cache: dict[int, pd.DataFrame] = {}
    for p in picks:
        iid = p["instrument_id"]
        if iid not in bars_cache:
            bars_cache[iid] = load_bars(iid)
        df = bars_cache[iid]
        if df.empty:
            skipped.append((p, "시세 없음"))
            continue
        nxt = df.index[df["d"] > str(p["as_of"])]
        if len(nxt) == 0:
            skipped.append((p, "다음 거래일 시세 없음"))
            continue
        i0 = int(nxt[0])
        entry = float(df.at[i0, "open"])          # 새 규칙 = 다음 거래일 시가
        a = atr_series(df.iloc[: i0 + 1]).iloc[-1]
        if not (a and a > 0):
            skipped.append((p, "ATR 산출 불가"))
            continue
        entry_day = str(df.at[i0, "d"])
        bars = df.iloc[i0:][["low", "high", "close"]].to_dict("records")
        passed = [h for h in combos.get(p["setup"], []) if h in HORIZONS]
        for hz in HORIZONS:
            prof = get_profile(hz, p["setup"])
            lv = compute_levels(
                style=HORIZON_STYLE[hz], side="buy", entry_price=entry,
                atr=float(a), risk_per_trade_pct=RISK_PCT, setup=p["setup"],
                stop_atr_mult=prof.stop_atr_mult, tp_atr_mults=prof.tp_atr_mults,
            )
            newp = {
                "as_of": p["as_of"], "setup": p["setup"], "horizon": hz,
                "entry_rule": "next_open", "entry_price": entry,
                "stop_loss": lv.stop_loss, "target_price": lv.tp1,
                "tp2_price": lv.tp2, "tp1_hit": False,
            }
            patch = resolve_pick_status(newp, bars, today) or {}
            out.append({
                "src_id": p["id"], "instrument_id": iid, "as_of": p["as_of"],
                "setup": p["setup"], "horizon": hz, "gate_pass": hz in passed,
                "entry_day": entry_day,
                "old_status": p["status"], "old_ret": p.get("close_return_pct"),
                "row": {**newp, **patch},
            })
    return out, skipped


def summarize(out: list[dict]) -> None:
    def agg(rows: list[dict]) -> str:
        cl = [r for r in rows if r["row"].get("status", "open") not in
              ("open", "pending")]
        rs = [r["row"]["close_return_pct"] for r in cl
              if r["row"].get("close_return_pct") is not None]
        opn = len(rows) - len(cl)
        if not rs:
            return f"{len(rows):>3}건 · 진행중 {opn:>3} · 종료 {len(cl):>3} · 성적 없음"
        w = sum(1 for x in rs if x > 0)
        return (f"{len(rows):>3}건 · 진행중 {opn:>3} · 종료 {len(cl):>3} · "
                f"승 {w:>2} ({w/len(rs)*100:>3.0f}%) · 평균 {sum(rs)/len(rs)*100:+6.1f}%")

    print()
    print("=" * 84)
    print("기간별 재현 성과 — 픽 1건을 단기·중기·장기 3벌로")
    print("=" * 84)
    for hz, label in LABELS:
        print(f"  {label:<11}", agg([r for r in out if r["horizon"] == hz]))

    gp = [r for r in out if r["gate_pass"]]
    print()
    print("  — 현 게이트 통과 조합만 —")
    if gp:
        for hz, label in LABELS:
            g = [r for r in gp if r["horizon"] == hz]
            if g:
                print(f"  {label:<11}", agg(g))
    else:
        print("  없음")

    seen: dict[int, dict] = {}
    for r in out:
        seen[r["src_id"]] = r
    old = [r for r in seen.values()
           if r["old_status"] not in ("open", "pending") and r["old_ret"] is not None]
    if old:
        w = sum(1 for r in old if r["old_ret"] > 0)
        print()
        print(f"  비교 — 옛 규칙 실제 기록: 종료 {len(old)}건 · 승 {w} "
              f"({w/len(old)*100:.0f}%) · 평균 "
              f"{sum(r['old_ret'] for r in old)/len(old)*100:+.1f}%")
    print("=" * 84)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help=f"{RESIM_BASKET} 바스켓에 적재한다")
    ap.add_argument("--backup", default=None, help="원본 픽을 저장할 JSON 경로")
    args = ap.parse_args()

    picks = select_all(
        "recommendations",
        "id,instrument_id,as_of,setup,style,horizon,entry_price,stop_loss,"
        "target_price,tp2_price,tp1_hit,status,exit_price,close_return_pct,"
        "closed_at,entry_rule,conviction,thesis",
        eq={"basket_type": SOURCE_BASKET})
    picks.sort(key=lambda p: (p["as_of"], p["id"]))
    print(f"\n대상 픽 {len(picks)}건 (basket={SOURCE_BASKET})")

    if args.backup:
        with open(args.backup, "w", encoding="utf-8") as f:
            json.dump(picks, f, ensure_ascii=False, indent=1)
        print(f"원본 백업 → {args.backup}")

    out, skipped = simulate(picks, passed_combos_from_db())
    print(f"재현 {len(out)}건 · 건너뜀 {len(skipped)}건")
    for p, why in skipped:
        print(f"  건너뜀 {p['as_of']} {p['setup']} — {why}")

    summarize(out)

    if not args.apply:
        print(f"\n(쓰기 안 함 — 적재하려면 --apply)")
        return

    rows = []
    for r in out:
        row = r["row"]
        rows.append({
            "basket_type": RESIM_BASKET,
            # style 은 NOT NULL enum 이라 비울 수 없다 — 기간의 화면 호환 라벨을 쓴다.
            "style": HORIZON_STYLE[r["horizon"]],
            "instrument_id": r["instrument_id"],
            "as_of": r["as_of"],
            "setup": r["setup"],
            "horizon": r["horizon"],
            "entry_rule": "next_open",
            "entry_price": round(float(row["entry_price"]), 4),
            "stop_loss": round(float(row["stop_loss"]), 4),
            "target_price": round(float(row["target_price"]), 4),
            "tp2_price": round(float(row["tp2_price"]), 4),
            "tp1_hit": bool(row.get("tp1_hit")),
            "status": row.get("status", "open"),
            "closed_at": row.get("closed_at"),
            "exit_price": row.get("exit_price"),
            "close_return_pct": row.get("close_return_pct"),
            "confirmed_at": r["entry_day"],
            # 게이트 통과 여부를 conviction 에 실어 화면이 «검증된 조합»을 가린다.
            "conviction": 1.0 if r["gate_pass"] else 0.0,
            "thesis": ("현 게이트 통과 조합" if r["gate_pass"]
                       else "게이트 미통과 — 새 규칙이었다면 발행되지 않았을 조합"),
        })
    upsert("recommendations", rows,
           on_conflict="basket_type,instrument_id,as_of,horizon")
    print(f"\n{len(rows)}건 적재 완료 (basket={RESIM_BASKET})")


if __name__ == "__main__":
    main()
