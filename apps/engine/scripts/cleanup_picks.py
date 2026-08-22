"""정리: daily_focus 픽에서 '애초에 나가지 말았어야 할' 행을 걷어낸다.

배경(2026-08-16 전수 점검, 111건) — 픽 데이터가 두 가지로 오염돼 있었다.

  ① 중복 발행 (111건 → 고유 플랜 80건)
     같은 종목·같은 진입가/손절/목표 플랜이 최대 5일 연속 재발행됐다. 픽 선정은
     매일 후보를 다시 뽑는데, 진입가가 아직 살아 있으면(_entry_actionable) 어제
     낸 그 플랜이 오늘도 상위에 들어 새 행으로 또 적재된다.
     결과: 인바디 48,000 플랜 1건이 5행이 되어 -5.09% 손절이 5번 집계됐다.
     더 나쁜 건 판정 불일치다 — 한국알콜 13,580 동일 플랜 4행 중 3행은 손절
     (-4.55%), 1행은 익절(+7.73%)이다. resolve_pick_status 가 as_of 다음 봉부터
     따라가기 때문에, 늦게 실린 행은 앞선 행이 이미 맞은 손절을 건너뛴다.
     같은 계획인데 발행일만 다르면 성적이 갈리는 건 트랙레코드가 아니다.

  ② 레벨 위반 (손절폭 20% 초과 / 손익비 1.0 미만)
     signals/levels.py 의 구조 손절 상한(MAX_STRUCT_STOP_ATR_MULT)과 daily.py 의
     손익비 하한(PICKS_MIN_RR)은 2026-08-14~16 에 들어갔다. 그 전에 발행된 픽은
     상한 없이 나갔다 — NHN 손절 -47.4%·손익비 0.42(47% 걸고 20% 먹는 계획),
     씨이랩 -44.8%, 한탑 -39.8%. 이 중 9건은 아직 열려 있어 손실이 자라는 중이다.

정책(2026-08-16 결정): 무효 표시가 아니라 **삭제**. 다만 지우면 못 되돌리므로
실행 전 daily_focus 전량을 JSON 으로 덤프한다(--backup-dir).

주의 — 청산까지 끝난 위반 픽(엘티씨·신세계·SK가스 등)을 지우면 손실이 성적에서
빠져 트랙레코드가 실제보다 좋아 보인다. 그래서 이 스크립트는 삭제 전후 성적을
둘 다 출력한다. 대외 성적 인용 시엔 '정리 전' 숫자를 함께 밝힐 것.

실행 (apps/engine 에서):
    python -m scripts.cleanup_picks              # 드라이런 — 무엇이 지워질지만 출력
    python -m scripts.cleanup_picks --apply      # 실제 삭제 (백업 후)
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from engine.db import get_client, select_all

BASKET = "daily_focus"

# 손절폭 상한 — levels.py 의 구조 손절 상한(1.5×ATR)은 ATR 상대값이라 발행 후에는
# 재현이 안 된다(픽 행에 ATR 을 안 남긴다). 대신 그 상한 도입 근거로 쓰인 실측
# 기준을 그대로 쓴다: 전수 점검 999건에서 손절 -20% 초과가 82건(8.2%)이었고,
# 그 구간이 "손절이 아니라 방치"로 판정된 구간이다.
MAX_STOP_PCT = 0.20
# 손익비 하한 — daily.py PICKS_MIN_RR 과 동일. 1.0 미만은 맞아도 손해.
MIN_RR = 1.0

CLOSED_STATUSES = ("target", "stopped", "expired", "partial")
WON_STATUSES = ("target", "partial")

PICK_COLUMNS = (
    "id,basket_type,setup,style,instrument_id,weight,conviction,thesis,"
    "entry_price,target_price,tp2_price,stop_loss,as_of,rebalance_id,created_at,"
    "status,closed_at,exit_price,close_return_pct,tp1_hit,tp1_hit_at"
)


def _f(v) -> float | None:
    return None if v is None else float(v)


def _stop_pct(row: dict) -> float | None:
    """진입가 대비 손절 거리 비율. 계산 불가면 None."""
    e, s = _f(row.get("entry_price")), _f(row.get("stop_loss"))
    if not e or s is None:
        return None
    return abs(e - s) / e


def _rr(row: dict) -> float | None:
    """손익비 = 목표까지 거리 / 손절까지 거리. 계산 불가면 None."""
    e, s, t = _f(row.get("entry_price")), _f(row.get("stop_loss")), _f(row.get("target_price"))
    if e is None or s is None or t is None:
        return None
    risk = abs(e - s)
    return abs(t - e) / risk if risk > 0 else None


def _plan_key(row: dict) -> tuple:
    """'같은 플랜'의 정의 — 종목과 세 가격이 모두 같으면 같은 거래다."""
    return (
        row.get("instrument_id"),
        _f(row.get("entry_price")),
        _f(row.get("stop_loss")),
        _f(row.get("target_price")),
    )


def find_duplicates(rows: list[dict]) -> list[dict]:
    """동일 플랜 재발행분 — 그룹의 **최초 발행일 1건만 남기고** 나머지를 반환.

    최초를 남기는 이유: 그 날이 신호가 실제로 처음 선 날이고, 그 날 진입했다면
    이후 재발행분은 존재하지 않았을 거래다(이미 보유 중이므로).
    """
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        groups[_plan_key(r)].append(r)
    drop: list[dict] = []
    for members in groups.values():
        if len(members) < 2:
            continue
        members.sort(key=lambda r: (str(r["as_of"]), r["id"]))
        drop.extend(members[1:])
    return drop


def find_regime_violations(rows: list[dict], regime_by_date: dict[str, dict]) -> list[dict]:
    """발행 당시 하락장이었고, **현 억제 규칙이라면 차단됐을** 픽.

    왜 '하락장 발행 전부'가 아닌가 — 억제는 추세·돌파 계열만 막는다. 하락장에서도
    역추세(과대낙폭 반등·바닥)와 수급(flow_accumulation)은 허용된다. 국면만 보고
    싹 지우면 규칙이 허용했을 픽까지 지우게 된다. 그래서 실제 판정 함수
    (_pick_suppressed)를 그대로 태운다 — 화면·발행과 같은 규칙을 쓴다.

    배경(2026-08-16): 픽 63건 중 48건(76%)이 risk_off 구간 발행이고 그중 79%가
    손절이다. 상승장 발행분은 손절 3/14 로 확연히 다르다. 그런데 이 억제 로직은
    2026-06-24 부터 master 에 있었다 — 실행 환경이 61커밋 뒤처져 안 돌았을 뿐이다
    (stale deploy). 즉 시스템이 몰라서가 아니라 아는 걸 실행하지 못해 나간 픽들이다.

    ⚠️ 이걸 지우면 남은 성적이 실제보다 좋아 보이고, 그 사고의 대가가 장부에서
    사라진다. 삭제 전/후 성적을 반드시 함께 볼 것(main 이 둘 다 출력한다).
    """
    from engine.reports.daily import _pick_suppressed

    out = []
    for r in rows:
        reg = regime_by_date.get(str(r.get("as_of"))) or {}
        if reg.get("regime") != "risk_off":
            continue
        if _pick_suppressed(r.get("setup"), reg.get("market_state"), True,
                            r.get("horizon")):
            out.append(r)
    return out


def find_level_violations(rows: list[dict]) -> list[dict]:
    """손절폭 상한 초과 또는 손익비 하한 미달 픽."""
    out = []
    for r in rows:
        sp, rr = _stop_pct(r), _rr(r)
        if (sp is not None and sp > MAX_STOP_PCT) or (rr is not None and rr < MIN_RR):
            out.append(r)
    return out


def score(rows: list[dict]) -> dict:
    """청산된 픽 기준 성적 — 승률·평균수익률·합계."""
    closed = [r for r in rows if r.get("status") in CLOSED_STATUSES]
    rets = [_f(r.get("close_return_pct")) for r in closed]
    rets = [x for x in rets if x is not None]
    won = sum(1 for r in closed if r.get("status") in WON_STATUSES)
    return {
        "open": sum(1 for r in rows if r.get("status") == "open"),
        "closed": len(closed),
        "won": won,
        "win_rate": (won / len(closed) * 100) if closed else 0.0,
        "avg_ret_pct": (sum(rets) / len(rets) * 100) if rets else 0.0,
        "sum_ret_pct": sum(rets) * 100 if rets else 0.0,
    }


def _fmt_score(label: str, s: dict) -> str:
    return (
        f"  {label:<12} 진행 {s['open']:>3}건 · 청산 {s['closed']:>3}건 · "
        f"승 {s['won']:>2}건(승률 {s['win_rate']:5.1f}%) · "
        f"평균 {s['avg_ret_pct']:+6.2f}% · 누적 {s['sum_ret_pct']:+8.2f}%"
    )


def _name_map(rows: list[dict]) -> dict[int, str]:
    ids = {r["instrument_id"] for r in rows}
    return {
        it["id"]: f"{it.get('symbol')} {it.get('name')}"
        for it in select_all("instruments", "id,symbol,name")
        if it["id"] in ids
    }


def _dump(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="daily_focus 픽 정리 (중복·레벨 위반 삭제)")
    ap.add_argument("--apply", action="store_true", help="실제 삭제 (기본은 드라이런)")
    ap.add_argument("--backup-dir", default="data/pick_backups", help="삭제 전 덤프 위치")
    ap.add_argument("--regime", action="store_true",
                    help="하락장 억제 위반분도 삭제 대상에 포함(find_regime_violations)")
    args = ap.parse_args()

    rows = select_all("recommendations", PICK_COLUMNS, eq={"basket_type": BASKET})
    rows.sort(key=lambda r: (str(r["as_of"]), r["id"]))
    names = _name_map(rows)
    print(f"daily_focus 픽 {len(rows)}건 로드 "
          f"({rows[0]['as_of']} ~ {rows[-1]['as_of']})\n")

    dups = find_duplicates(rows)
    viols = find_level_violations(rows)
    regime_viols: list[dict] = []
    if args.regime:
        regime_by_date = {
            str(m["date"]): m
            for m in select_all("market_regime", "date,regime,market_state")
        }
        regime_viols = find_regime_violations(rows, regime_by_date)
    drop_ids = ({r["id"] for r in dups} | {r["id"] for r in viols}
                | {r["id"] for r in regime_viols})
    keep = [r for r in rows if r["id"] not in drop_ids]

    print(f"── ① 중복 발행 (동일 플랜 재발행) — {len(dups)}건 삭제 대상 ──")
    by_plan: dict[tuple, list[dict]] = defaultdict(list)
    for r in dups:
        by_plan[_plan_key(r)].append(r)
    for k, members in sorted(by_plan.items(), key=lambda kv: -len(kv[1])):
        days = ", ".join(str(m["as_of"]) for m in members)
        print(f"  {names.get(k[0], k[0]):<22} 진입 {k[1]:>12,.0f}  "
              f"재발행 {len(members)}건 ({days})")

    print(f"\n── ② 레벨 위반 (손절폭>{MAX_STOP_PCT:.0%} 또는 손익비<{MIN_RR}) "
          f"— {len(viols)}건 삭제 대상 ──")
    for r in sorted(viols, key=lambda r: -(_stop_pct(r) or 0)):
        sp, rr = _stop_pct(r), _rr(r)
        mark = " [중복과 겹침]" if r in dups else ""
        print(f"  {r['as_of']}  {names.get(r['instrument_id'], ''):<22} "
              f"손절 {sp*100 if sp else 0:5.1f}% · 손익비 {rr or 0:4.2f} · "
              f"{r.get('status')}{mark}")

    if args.regime:
        print(f"\n── ③ 하락장 억제 위반 (현 규칙이면 차단) — {len(regime_viols)}건 삭제 대상 ──")
        by_setup: dict[str, list[dict]] = defaultdict(list)
        for r in regime_viols:
            by_setup[str(r.get("setup"))].append(r)
        for setup, members in sorted(by_setup.items(), key=lambda kv: -len(kv[1])):
            stopped = sum(1 for m in members if m.get("status") == "stopped")
            tot = sum(_f(m.get("close_return_pct")) or 0.0 for m in members)
            print(f"  {setup:<20} {len(members):>3}건 · 손절 {stopped:>2}건 · "
                  f"누적 {tot*100:+7.1f}%")

    print(f"\n── 합계 ── 삭제 {len(drop_ids)}건 / 잔존 {len(keep)}건")
    print("\n성적 비교(청산분 기준):")
    print(_fmt_score("정리 전", score(rows)))
    print(_fmt_score("정리 후", score(keep)))
    print("\n  ※ 청산까지 끝난 위반 픽도 지우므로 '정리 후'가 실제보다 좋아 보인다.")
    print("     대외 인용 시 '정리 전' 숫자를 함께 밝힐 것.")

    if not args.apply:
        print("\n[드라이런] 삭제하지 않았다. 실행하려면 --apply")
        return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = Path(args.backup_dir) / f"daily_focus_{stamp}.json"
    _dump(rows, backup)
    print(f"\n[백업] 전량 {len(rows)}건 → {backup}")

    client = get_client()
    ids = sorted(drop_ids)
    deleted = 0
    for i in range(0, len(ids), 100):          # URL 길이 가드 — 100개씩
        chunk = ids[i:i + 100]
        res = client.table("recommendations").delete().in_("id", chunk).execute()
        deleted += len(res.data or [])
    print(f"[삭제] {deleted}건 제거 완료. 잔존 {len(rows) - deleted}건")


if __name__ == "__main__":
    main()
