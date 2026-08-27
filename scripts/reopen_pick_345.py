"""#345(키다리스튜디오) 되살리기 — 본전스톱 전환 «이전» 봉으로 난 오판을 취소한다.

2026-08-27 배치가 봉을 confirmed_at(8/25)부터 다시 읽으면서, 전환일(8/26)보다
하루 앞선 8/25 의 저가 5,040 으로 본전(5,300) 청산했다. 8/27 종가 5,800 —
+9.4% 인 픽이 0% 무승부로 기록됐다. 코드는 fd81183 에서 고쳤고(_pre_trail),
이 스크립트는 그 사고로 잘못 닫힌 기록 1건만 되돌린다.

update 만 한다 — 삭제 없음. 상태가 예상과 다르면 아무것도 안 하고 멈춘다.
"""
import sys

sys.path.insert(0, r"D:\Stock-Alpha\apps\engine")
from engine.db import get_client                                    # noqa: E402

FIELDS = "id,status,closed_at,exit_price,close_return_pct,tp1_hit,tp1_hit_at"

client = get_client()
before = client.table("recommendations").select(FIELDS).eq("id", 345).execute().data
print("이전:", before)
if not before or before[0]["status"] != "breakeven":
    sys.exit("예상 상태(breakeven)가 아니다 — 아무것도 하지 않고 중단한다.")

client.table("recommendations").update({
    "status": "open",
    "closed_at": None,
    "exit_price": None,
    "close_return_pct": None,      # tp1_hit / tp1_hit_at 은 유지 — 전환은 사실이다
}).eq("id", 345).execute()

print("이후:", client.table("recommendations").select(FIELDS).eq("id", 345).execute().data)
