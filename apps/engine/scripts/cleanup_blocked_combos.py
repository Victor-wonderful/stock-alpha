"""정리: 체결 가정 불일치로 차단된 조합(gate.BLOCKED_COMBOS)의 «살아있는» 데이터 제거.

배경(2026-08-21) — 게이트는 entry_mode="signal"(신호가에 무조건 체결)로 기대값을
재는데 라이브 발행은 지정가라, 아래 5조합은 게이트를 통과하고도 라이브 기준
기대값이 ≤0 이다([[pick-entry-fill-gap]], var/entry_mode_results.jsonl).

    flow_accumulation:position  -0.034      pivot:swing               -0.012
    anchor_pullback:swing       -0.019      flow_accumulation:swing   -0.011
    breakout:swing              -0.000

코드는 gate.BLOCKED_COMBOS 로 앞으로의 발행을 막았다. 이 스크립트는 **이미 나가서
지금도 화면에 살아 있는 것**을 걷어낸다.

무엇을 지우고 무엇을 안 지우나 — 성격이 다르다:

  ✅ signals (지운다)
     자연키 업서트라 «현재 상태» 테이블이다(발행 이력이 아니다). 그런데 6월 행까지
     누적돼 있고 웹 /signals 는 날짜 필터 없이 강도순으로 그대로 보여준다. 즉 지금
     사용자가 보고 따라 살 수 있는 매매 계획이다. 지워도 트랙레코드는 손상되지 않는다.

  ❌ recommendations / daily_focus 픽 (기본은 안 지운다, --picks 로만)
     해당 5건은 **전부 이미 손절로 닫힌 이력**이다. 지우면 손실만 장부에서 빠져
     성적이 실제보다 좋아 보인다(승률 3.6%→4.3%, 누적 -2.25%→-1.65%).
     2026-08-16 정리에서 같은 일이 있었고 "사고의 대가가 장부에서 사라졌다"고
     남겨뒀다([[stock-alpha-pick-data-cleanup]]). 그래서 기본값은 보존이다.

  ❌ reports payload 의 plan 행 (건드리지 않는다)
     verdict(판정 점수)가 plan 의 최대 강도로 계산돼 payload 안에 이미 굳어 있다
     (reports/context.py: max_signal_strength). plan 행만 빼면 판정과 플랜이 서로
     어긋난 리포트가 되고, 판정까지 다시 계산하면 «그날 발행한 분석»을 사후에
     고쳐 쓰는 셈이다. 리포트는 매 배치일 다시 발행되고 /reports 목록은 최신
     발행일만 보여주므로, 시그널만 정리하면 다음 배치부터 자연히 깨끗해진다.

실행 (apps/engine 에서):
    python -m scripts.cleanup_blocked_combos            # 드라이런 — 무엇이 지워질지만
    python -m scripts.cleanup_blocked_combos --apply    # 시그널 삭제 (백업 후)
    python -m scripts.cleanup_blocked_combos --apply --picks   # 과거 픽까지 (비권장)

⚠️ 반드시 **당일 배치가 끝난 뒤** 실행할 것. 배치는 시작 시점의 코드를 메모리에
   올린 채 돌기 때문에, 돌고 있는 중에 지우면 그 배치가 다시 채워 넣는다.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path

from engine.backtest.gate import BLOCKED_COMBOS, combo_blocked
from engine.db import get_client

BASKET = "daily_focus"
CLOSED_STATUSES = ("target", "stopped", "expired", "partial")
WON_STATUSES = ("target", "partial")
BACKUP_DIR = Path(__file__).resolve().parents[1] / "data" / "cleanup_backups"


def _fetch_blocked_signals() -> list[dict]:
    c = get_client()
    out: list[dict] = []
    for setup, style in sorted(BLOCKED_COMBOS):
        res = (
            c.table("signals").select("*")
            .eq("setup", setup).eq("style", style).execute()
        )
        out.extend(res.data or [])
    return out


def _fetch_blocked_picks() -> list[dict]:
    c = get_client()
    rows = (
        c.table("recommendations").select("*").eq("basket_type", BASKET).execute()
    ).data or []
    return [r for r in rows if combo_blocked(r.get("setup"), r.get("style"))]


def _pick_stats(rows: list[dict]) -> str:
    closed = [r for r in rows if r.get("status") in CLOSED_STATUSES]
    won = [r for r in closed if r.get("status") in WON_STATUSES
           or (r.get("close_return_pct") or 0) > 0]
    # close_return_pct 는 비율(-0.06 = -6%) — 표시할 때 100 을 곱한다.
    total = 100 * sum(float(r.get("close_return_pct") or 0) for r in closed)
    wr = 100 * len(won) / len(closed) if closed else 0.0
    return f"청산 {len(closed):3}건 · 승 {len(won):2}건 · 승률 {wr:5.1f}% · 누적 {total:+.2f}%"


def _dump(name: str, rows: list[dict]) -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = BACKUP_DIR / f"{name}_{stamp}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2, default=str),
                    encoding="utf-8")
    return path


def _delete_by_ids(table: str, ids: list[int], chunk: int = 200) -> int:
    c = get_client()
    n = 0
    for i in range(0, len(ids), chunk):
        part = ids[i:i + chunk]
        c.table(table).delete().in_("id", part).execute()
        n += len(part)
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 삭제 (기본은 드라이런)")
    ap.add_argument("--picks", action="store_true",
                    help="과거 픽까지 삭제 — 비권장(성적이 실제보다 좋아 보인다)")
    args = ap.parse_args()

    print("차단 조합:", ", ".join(f"{s}:{st}" for s, st in sorted(BLOCKED_COMBOS)))
    print()

    sigs = _fetch_blocked_signals()
    by_combo = Counter((r["setup"], r["style"]) for r in sigs)
    print(f"[signals] 삭제 대상 {len(sigs)}건")
    for (s, st), n in sorted(by_combo.items()):
        print(f"    {s}:{st:9} {n:5}")
    if sigs:
        days = Counter((r.get("created_at") or "")[:10] for r in sigs)
        print(f"    생성일: {min(days)} ~ {max(days)} ({len(days)}일치 누적)")
    print()

    picks = _fetch_blocked_picks()
    all_picks = (
        get_client().table("recommendations").select("*")
        .eq("basket_type", BASKET).execute()
    ).data or []
    kept = [r for r in all_picks if not combo_blocked(r.get("setup"), r.get("style"))]
    print(f"[picks] 차단 조합 해당 {len(picks)}건 "
          f"(열림 {sum(1 for r in picks if r.get('status') == 'open')}건)")
    for r in picks:
        print(f"    {r['as_of']}  {r['setup']}:{r['style']:9} {r['status']:8} "
              f"{100 * float(r.get('close_return_pct') or 0):+.2f}%")
    print(f"    정리 전   {_pick_stats(all_picks)}")
    print(f"    삭제하면  {_pick_stats(kept)}   ← 손실만 빠져 좋아 보인다")
    if not args.picks:
        print("    → 보존한다(기본값). 삭제하려면 --picks.")
    print()

    if not args.apply:
        print("드라이런입니다. 실제로 지우려면 --apply 를 붙이세요.")
        return

    if sigs:
        print("백업:", _dump("blocked_signals", sigs))
        n = _delete_by_ids("signals", [r["id"] for r in sigs])
        print(f"[signals] {n}건 삭제 완료")
    if args.picks and picks:
        print("백업:", _dump("blocked_picks", picks))
        n = _delete_by_ids("recommendations", [r["id"] for r in picks])
        print(f"[picks] {n}건 삭제 완료 — 대외 인용 시 '정리 전' 숫자를 함께 밝힐 것")


if __name__ == "__main__":
    main()
