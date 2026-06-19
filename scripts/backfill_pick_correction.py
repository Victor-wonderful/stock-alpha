"""과거 종결 픽(daily_focus) 1회 보정.

종가 오버슈트로 기록됐던 청산을 백테스트와 동일한 '장중 고저 터치·레벨 체결'로
재산출한다(engine.reports.daily.resolve_pick_status 단일 출처). 삭제가 아니라
exit_price/close_return_pct/status 정정이며, 변경 전 값을 감사 JSON 으로 남긴다.

사용:
  python ../../scripts/backfill_pick_correction.py          # dry-run(미리보기)
  python ../../scripts/backfill_pick_correction.py --apply  # 실제 반영
"""
import json
import sys
from datetime import date

import psycopg

from engine.config import get_settings
from engine.reports.daily import resolve_pick_status

APPLY = "--apply" in sys.argv
CLOSED = ("target", "stopped", "expired", "partial")
dsn = get_settings().supabase_db_url
today = date.today()


def _f(x):
    return None if x is None else float(x)


def _wr(rets):
    rets = [r for r in rets if r is not None]
    return (100.0 * sum(r > 0 for r in rets) / len(rets)) if rets else 0.0


def _avg(rets):
    rets = [r for r in rets if r is not None]
    return (sum(rets) / len(rets) * 100) if rets else 0.0


with psycopg.connect(dsn) as conn:
    cur = conn.cursor()
    cur.execute(
        """select id, as_of, entry_price, target_price, tp2_price, stop_loss,
                  style, instrument_id, status, exit_price, close_return_pct, closed_at
           from recommendations
           where basket_type='daily_focus' and status = any(%s)
           order by as_of""",
        (list(CLOSED),),
    )
    cols = [d[0] for d in cur.description]
    picks = [dict(zip(cols, r)) for r in cur.fetchall()]
    print(f"종결 픽 {len(picks)}건 재판정\n")

    audit, updates = [], []
    old_rets, new_rets = [], []
    status_changes = 0

    for p in picks:
        cur.execute(
            """select low, high, close, ts from ohlcv
               where instrument_id=%s and interval='1d' and ts::date > %s
               order by ts""",
            (p["instrument_id"], p["as_of"]),
        )
        bars = [{"low": b[0], "high": b[1], "close": b[2]} for b in cur.fetchall()]
        pk = {**p, "tp1_hit": False}  # 전 구간 재도출
        patch = resolve_pick_status(pk, bars, today)

        old = {"status": p["status"], "exit_price": _f(p["exit_price"]),
               "close_return_pct": _f(p["close_return_pct"])}
        old_rets.append(old["close_return_pct"])

        if not patch or "status" not in patch:
            audit.append({"id": p["id"], "old": old, "new": None,
                          "note": f"재판정 불가(보류, 봉수={len(bars)})"})
            new_rets.append(old["close_return_pct"])  # 변경 없음
            continue

        new = {"status": patch["status"], "exit_price": _f(patch["exit_price"]),
               "close_return_pct": _f(patch["close_return_pct"])}
        new_rets.append(new["close_return_pct"])
        if new["status"] != old["status"]:
            status_changes += 1
        audit.append({"id": p["id"], "instrument_id": p["instrument_id"],
                      "as_of": str(p["as_of"]), "old": old, "new": new})
        updates.append((new["status"], new["exit_price"], new["close_return_pct"], p["id"]))

    # ── 미리보기 표 ──
    print(f"{'old→new status':28} {'old ret':>9} {'new ret':>9}")
    for a in audit:
        if a["new"] is None:
            print(f"  id={a['id']}  {a['note']}")
            continue
        o, nw = a["old"], a["new"]
        print(f"  {o['status']:>10} -> {nw['status']:<12} "
              f"{o['close_return_pct']*100:8.2f}% {nw['close_return_pct']*100:8.2f}%")

    print("\n=== 보정 전/후 종합 ===")
    print(f"  평균 수익  : {_avg(old_rets):.2f}%  ->  {_avg(new_rets):.2f}%")
    print(f"  승률       : {_wr(old_rets):.1f}%  ->  {_wr(new_rets):.1f}%")
    print(f"  상태 변경  : {status_changes}건   적용 대상: {len(updates)}건")

    # ── 감사 로그 저장 ──
    import pathlib
    audit_path = pathlib.Path(__file__).resolve().parents[1] / "var" / f"pick_correction_{today.isoformat()}.json"
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"\n감사 로그: {audit_path}")

    if not APPLY:
        print("\n*** DRY-RUN — 실제 반영하려면 --apply ***")
    else:
        for st, ex, ret, pid in updates:
            cur.execute(
                "update recommendations set status=%s, exit_price=%s, close_return_pct=%s where id=%s",
                (st, ex, ret, pid),
            )
        conn.commit()
        print(f"\n✅ 적용 완료 — {len(updates)}건 업데이트, closed_at 은 보존")
