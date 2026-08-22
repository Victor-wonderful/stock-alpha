"""옛 규칙으로 열려 있는 픽을 «규칙 교체 정리»로 닫는다.

Victor 결정(2026-08-22). 배경 —
2026-08-22 에 매매 규칙을 전면 교체했다(지정가 진입 → 다음 거래일 시가 · 스타일 축 →
기간 축 · 목표에서 전량 매도 → 목표는 본전스톱 트리거). 그런데 그 이전에 발행된 픽이
열린 채로 남아 세 가지를 동시에 막는다:

  · 셋업이 지금 게이트를 통과하지 못한다(median·ensemble·markov·kalman).
  · 타임아웃이 position 스타일 60봉이라 11월까지 안 닫힌다.
  · 노출 175% · 리스크 11.7% 로 포트폴리오 예산을 이미 넘겨(상한 100% / 10%)
    **신규 발행을 전부 막는다**(daily.MAX_PORTFOLIO_*).

열어둔 채 두는 건 «아직 이 픽을 지지한다»는 뜻이다. 지지하지 않으므로 닫는다.

## 어떻게 닫나

  · status = 'retired' — 새 상태다. «만료»로 적으면 거짓이다(기간이 다 돼서 나온 게
    아니라 우리가 규칙을 바꿔서 닫았다). 화면 라벨은 «규칙 교체 정리».
  · 청산가 = 마지막 거래일 종가. 실제로 존재한 가격이라 검증 가능하다.
  · 손익은 성적에 그대로 들어간다 — 사고팔았으므로 거래다. 유리하게 빼지 않는다.

실행 (apps/engine 에서):
    python -m scripts.retire_legacy_picks --on 2026-08-21            # 미리보기
    python -m scripts.retire_legacy_picks --on 2026-08-21 --apply
"""
from __future__ import annotations

import argparse
import statistics as st

from engine.db import get_client, select_all
from engine.logging import get_logger
from engine.reports.daily import account_risk_pct, position_size_pct

log = get_logger(__name__)

BASKET = "daily_focus"
RETIRED = "retired"


def latest_close_on(iid: int, on: str) -> tuple[str, float] | None:
    """on 날짜 이하의 마지막 일봉 (날짜, 종가)."""
    res = (
        get_client().table("ohlcv").select("ts,close")
        .eq("instrument_id", iid).eq("interval", "1d")
        .lte("ts", on + "T23:59:59")
        .order("ts", desc=True).limit(1).execute()
    ).data or []
    if not res or res[0].get("close") is None:
        return None
    return str(res[0]["ts"])[:10], float(res[0]["close"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--on", required=True,
                    help="이 날짜(포함) 종가로 청산. 휴장일이면 그 이전 거래일 종가")
    ap.add_argument("--apply", action="store_true", help="실제로 닫는다")
    args = ap.parse_args()

    rows = [
        r for r in select_all(
            "recommendations",
            "id,instrument_id,as_of,style,horizon,setup,entry_price,stop_loss,status",
            eq={"basket_type": BASKET})
        if r.get("status") == "open"
    ]
    if not rows:
        print("\n열린 픽이 없다 — 할 일 없음")
        return

    names = {i["id"]: (i.get("name") or i.get("symbol") or "")
             for i in select_all("instruments", "id,symbol,name")}

    print(f"\n열린 픽 {len(rows)}건 — {args.on} 이하 마지막 종가로 청산")
    print(f"{'발행일':<12}{'종목':<14}{'셋업':<12}{'기간':<6}"
          f"{'진입':>10}{'청산':>10}{'손익':>8}{'비중':>7}")
    print("-" * 82)

    patches: list[tuple[int, dict]] = []
    rets: list[float] = []
    freed_risk = freed_expo = 0.0
    skipped: list[tuple[dict, str]] = []
    for r in sorted(rows, key=lambda x: x["as_of"]):
        entry = r.get("entry_price")
        px = latest_close_on(int(r["instrument_id"]), args.on)
        if not entry or not px:
            skipped.append((r, "종가 또는 진입가 없음"))
            continue
        d, close = px
        ret = close / float(entry) - 1
        rets.append(ret)
        freed_risk += account_risk_pct(entry, r.get("stop_loss"))
        freed_expo += position_size_pct(entry, r.get("stop_loss"))
        patches.append((int(r["id"]), {
            "status": RETIRED,
            "closed_at": d,
            "exit_price": round(close, 4),
            "close_return_pct": round(ret, 6),
        }))
        print(f"{r['as_of']:<12}{names.get(r['instrument_id'], '')[:6]:<14}"
              f"{(r.get('setup') or '')[:10]:<12}{(r.get('horizon') or '—'):<6}"
              f"{float(entry):>10,.0f}{close:>10,.0f}{ret * 100:>7.1f}%"
              f"{position_size_pct(entry, r.get('stop_loss')):>6.1f}%")

    for r, why in skipped:
        print(f"  건너뜀 {r['as_of']} {r.get('setup')} — {why}")

    print("-" * 82)
    if rets:
        wins = sum(1 for x in rets if x > 0)
        print(f"{len(rets)}건 청산 · 승 {wins} ({wins / len(rets) * 100:.0f}%) · "
              f"평균 {st.mean(rets) * 100:+.2f}% · "
              f"최악 {min(rets) * 100:+.1f}% · 최고 {max(rets) * 100:+.1f}%")
    print(f"예산 회수 — 리스크 {freed_risk:.1f}%p · 노출 {freed_expo:.1f}%p · "
          f"종목 {len(patches)}개")

    if not args.apply:
        print("\n(쓰기 안 함 — 실제로 닫으려면 --apply)")
        return

    cli = get_client()
    for pid, patch in patches:
        cli.table("recommendations").update(patch).eq("id", pid).execute()
    log.info("picks.retired", n=len(patches), on=args.on)
    print(f"\n{len(patches)}건 닫았다 (status={RETIRED})")


if __name__ == "__main__":
    main()
