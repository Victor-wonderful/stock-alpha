"""기존 픽을 «진입 체결» 기준으로 다시 판정 (2026-08-20).

판정 규칙이 바뀌었다 — 진입가에 닿지 않은 픽은 이겨도 거래가 아니다(unfilled).
이미 닫힌 픽들은 옛 규칙으로 확정돼 있어, 성적표를 정직하게 만들려면 다시 세야 한다.

기본은 **미리보기**다. --apply 를 줘야 DB 를 고친다.
원본은 apply 전에 data/pick_backups/ 로 전량 덤프한다.

사용:
    python -m scripts.rejudge_picks_fill            # 무엇이 바뀌는지만 출력
    python -m scripts.rejudge_picks_fill --apply    # 실제 반영
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import psycopg

from engine.config import get_settings
from engine.reports.daily import resolve_pick_status


def load_picks(cur) -> list[dict]:
    cur.execute("""
        select id, as_of, entry_price, target_price, tp2_price, stop_loss,
               style, tp1_hit, status, close_return_pct, instrument_id
        from recommendations
        where basket_type = 'daily_focus'
        order by as_of, id
    """)
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def load_bars(cur, instrument_id: int, after: date) -> list[dict]:
    """as_of 다음 거래일부터 오늘까지 일봉 — 판정 함수가 기대하는 형태."""
    cur.execute("""
        select low, high, close
        from ohlcv
        where instrument_id = %s and interval = '1d'
          and (ts at time zone 'UTC')::date > %s
        order by ts
    """, (instrument_id, after))
    return [{"low": float(l), "high": float(h), "close": float(c)}
            for l, h, c in cur.fetchall()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="DB 에 실제 반영")
    args = ap.parse_args()

    dsn = get_settings().supabase_db_url
    if not dsn:
        print("SUPABASE_DB_URL 미설정", file=sys.stderr)
        return 1

    today = date.today()
    changes: list[tuple[dict, dict]] = []
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        picks = load_picks(cur)
        print(f"대상 {len(picks)}건")
        for p in picks:
            bars = load_bars(cur, p["instrument_id"], p["as_of"])
            # 판정 함수는 '열린 픽'을 전제로 한다 — 닫힌 픽도 처음부터 다시 돌린다.
            fresh = dict(p)
            fresh["tp1_hit"] = False          # 옛 규칙이 남긴 상태를 끌고 오지 않는다
            out = resolve_pick_status(fresh, bars, today)
            new_status = (out or {}).get("status") or "open"
            if new_status != p["status"]:
                changes.append((p, out or {"status": "open"}))

        print()
        print("=== 상태 전이 ===")
        trans = Counter(f"{old['status']} → {new['status']}" for old, new in changes)
        for k, v in trans.most_common():
            print(f"  {k:<24} {v}건")

        before = Counter(p["status"] for p in picks)
        after = Counter(before)
        for old, new in changes:
            after[old["status"]] -= 1
            after[new["status"]] += 1
        print()
        print("=== 전체 분포 ===")
        for st in sorted(set(before) | set(after)):
            print(f"  {st:<10} {before.get(st,0):>3} → {after.get(st,0):>3}")

        done_b = before.get("target", 0) + before.get("stopped", 0)
        done_a = after.get("target", 0) + after.get("stopped", 0)
        print()
        print("=== 승률 ===")
        if done_b:
            print(f"  이전: {before.get('target',0)}/{done_b} = {before.get('target',0)/done_b*100:.1f}%")
        if done_a:
            print(f"  이후: {after.get('target',0)}/{done_a} = {after.get('target',0)/done_a*100:.1f}%")

        if not args.apply:
            print()
            print("※ 미리보기입니다. 반영하려면 --apply")
            return 0

        # ── 원본 덤프 후 반영 ──
        outdir = Path(__file__).resolve().parents[1] / "apps/engine/data/pick_backups"
        outdir.mkdir(parents=True, exist_ok=True)
        stamp = today.isoformat()
        dump = outdir / f"before_fill_rejudge_{stamp}.json"
        dump.write_text(json.dumps(picks, ensure_ascii=False, indent=2, default=str),
                        encoding="utf-8")
        print(f"\n원본 {len(picks)}건 덤프 → {dump}")

        for old, new in changes:
            cur.execute("""
                update recommendations
                set status = %s, closed_at = %s, exit_price = %s,
                    close_return_pct = %s, tp1_hit = coalesce(%s, tp1_hit)
                where id = %s
            """, (new.get("status"), new.get("closed_at"), new.get("exit_price"),
                  new.get("close_return_pct"), new.get("tp1_hit"), old["id"]))
        conn.commit()
        print(f"반영 완료 — {len(changes)}건 변경")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
