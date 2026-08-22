"""정리: 기간 축 도입(2026-08-22) 이전에 발행된 시그널을 걷어낸다.

왜 지워야 하나 — 옛 시그널은 «스타일»이 보유기간을 정하던 시절의 산물이라 지금
규칙과 세 가지가 어긋난다:

  ① 보유기간이 틀렸다. 87%가 position(60거래일)인데 그 기간으로 게이트를 통과한
     조합은 하나도 없다. 화면에는 「최대 60거래일」이라고 적힌다.
  ② 손절·목표가 옛 규칙으로 산출됐다. 지금은 기간 프로파일이 정하고, 목표는
     «파는 트리거»가 아니라 «손절을 본전으로 올리는 트리거»다.
  ③ 검증 대조가 안 된다. 게이트 판정이 (셋업 × 기간)인데 이 행들은 기간이 없어
     전부 «미검증»으로 뜬다 — 화면 대부분이 경고 딱지를 달게 된다.

자연키에 horizon 이 들어갔으므로(0038) 새 시그널이 옛 행을 덮어쓰지 않는다.
그냥 두면 «미검증 60거래일» 행이 새 발행분과 나란히 계속 남는다.

⚠️ 지운 직후부터 다음 배치(16:30 KST)까지 스크리너는 비어 있다. 틀린 계획을
보여주는 것보다 낫다는 판단이지만, 사용자에게 «오늘 신호 없음»으로 보인다는 뜻이다.

실행 (apps/engine 에서):
    python -m scripts.cleanup_legacy_signals            # 드라이런
    python -m scripts.cleanup_legacy_signals --apply    # 백업 후 삭제
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path

from engine.db import get_client

BACKUP_DIR = Path(__file__).resolve().parents[1] / "data" / "cleanup_backups"
PAGE = 1000


def _fetch_legacy() -> list[dict]:
    """horizon 이 없는 시그널 전량 — 페이지네이션(1000행 상한)."""
    c = get_client()
    out: list[dict] = []
    start = 0
    while True:
        res = (
            c.table("signals").select("*").is_("horizon", "null")
            .order("id").range(start, start + PAGE - 1).execute()
        ).data or []
        out.extend(res)
        if len(res) < PAGE:
            break
        start += PAGE
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 삭제 (기본은 드라이런)")
    args = ap.parse_args()

    rows = _fetch_legacy()
    c = get_client()
    total = (c.table("signals").select("id", count="exact", head=True).execute()).count
    print(f"시그널 전체 {total}건 · 기간 없는 옛 행 {len(rows)}건\n")
    if not rows:
        print("정리할 게 없다.")
        return

    combos = Counter(f"{r.get('setup')}:{r.get('style')}" for r in rows)
    print(f"{'조합':32}{'건수':>7}")
    for k, n in combos.most_common(12):
        print(f"{k:32}{n:>7}")
    if len(combos) > 12:
        print(f"{'… 그 외 ' + str(len(combos) - 12) + '조합':32}")
    days = Counter((r.get("created_at") or "")[:10] for r in rows)
    print(f"\n생성일 {min(days)} ~ {max(days)} ({len(days)}일치 누적)")

    if not args.apply:
        print("\n드라이런이다. 실제로 지우려면 --apply.")
        return

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    path = BACKUP_DIR / f"legacy_signals_{datetime.now():%Y%m%d-%H%M%S}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2, default=str),
                    encoding="utf-8")
    print(f"\n백업: {path}")

    ids = [r["id"] for r in rows]
    for i in range(0, len(ids), 200):
        c.table("signals").delete().in_("id", ids[i:i + 200]).execute()
    left = (c.table("signals").select("id", count="exact", head=True).execute()).count
    print(f"{len(ids)}건 삭제 완료 · 남은 시그널 {left}건")
    print("→ 다음 배치(16:30 KST)가 (셋업 × 기간)으로 새로 채운다.")


if __name__ == "__main__":
    main()
