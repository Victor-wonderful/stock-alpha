# 픽 따라 하기 — 텔레그램 알림 + 내 주문표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원이 «오늘의 픽»을 따라 할 수 있도록, 엔진이 매일 «할 일 목록»을 한 번 만들고 그것을 텔레그램(저녁 묶음·아침 리마인더)과 웹 「내 주문표」가 똑같이 읽게 한다.

**Architecture:** 엔진(Python, 운영 PC)이 일일 배치 끝에 `pick_actions` 를 쓰고 `notify` 명령이 텔레그램으로 보낸다(중복 방지는 `notification_outbox` unique 키). 웹(Next.js, Vercel)은 텔레그램 웹훅으로 회원 ↔ chat_id 를 잇고(비밀값을 확인하는 security definer 함수 경유 — 웹에는 service role 키가 없다), `/orders` 에서 같은 `pick_actions` 를 읽어 수량·금액을 계산한다. 추격 손절값은 엔진이 `recommendations.trail_stop` 에 저장하고 모두가 그 값을 읽는다.

**Tech Stack:** Python 3.12(pytest, httpx, supabase-py) · Next.js 15 App Router(TS, Tailwind, @supabase/ssr) · Supabase Postgres(RLS) · Telegram Bot API

**설계서:** `docs/superpowers/specs/2026-10-09-pick-follow-alerts-design.md`

**설계서와 다른 점 1개:** 아침 리마인더를 08:00 이 아니라 **기존 모닝 배치(08:30 KST) 맨 앞**에서 보낸다. 장 시작(09:00) 전이고, 예약 작업을 새로 만들지 않아도 된다(운영 PC 는 시간대 환산 함정이 있다 — 메모리 `moscow-timezone-trap`).

---

## 선행 조건

- `fix/halt-bars-stop-cap` 브랜치(거래정지 봉·확정 손절 상한·뉴스 수집)가 master 에 머지된 뒤 시작한다.
- 작업 브랜치: `git checkout master && git pull && git checkout -b feat/pick-follow-alerts`
- 엔진 테스트: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests -q` (현재 463 passed)
- 웹에는 테스트 러너가 없다 → 웹 작업의 검증은 `npm run build` + 브라우저 확인(preview).

## 파일 지도

| 파일 | 역할 | 신규/수정 |
|---|---|---|
| `supabase/migrations/0051_pick_follow_alerts.sql` | 컬럼·표·RLS·연결 함수 | 신규 |
| `apps/engine/engine/reports/daily.py` | 추격 손절 저장(`resolve_pick_status`·`manage_picks`) | 수정 |
| `apps/engine/engine/notify/__init__.py` | 패키지 | 신규 |
| `apps/engine/engine/notify/actions.py` | 할 일 목록 생성(순수) + DB 쓰기 | 신규 |
| `apps/engine/engine/notify/messages.py` | 메시지 문구(순수) | 신규 |
| `apps/engine/engine/notify/telegram.py` | Bot API 호출 + 발송·재시도·차단 처리 + 운영 알림 | 신규 |
| `apps/engine/engine/config.py` | 텔레그램 설정 3개 | 수정 |
| `apps/engine/engine/cli.py` | `notify`·`telegram-setup` 명령, 일일 배치 훅, 워커 연결·실패 알림 | 수정 |
| `apps/engine/engine/ingest/naver_news.py` | 뉴스 0건 → 운영 알림 | 수정 |
| `apps/engine/tests/test_notify.py` | 액션·문구·발송 테스트 | 신규 |
| `apps/engine/tests/test_daily.py` | 추격 손절 저장 테스트 | 수정 |
| `apps/web/app/api/telegram/webhook/route.ts` | 웹훅(/start 코드·/끄기) | 신규 |
| `apps/web/middleware.ts` | 웹훅 경로 공개 | 수정 |
| `apps/web/app/alerts/actions.ts` | 연결·해제 서버 액션 | 신규 |
| `apps/web/app/alerts/page.tsx` | 「텔레그램」 줄을 실제 연결 상태로 | 수정 |
| `apps/web/lib/orders.ts` | 주문표 데이터·수량 계산 | 신규 |
| `apps/web/app/orders/page.tsx` · `_amount.tsx` · `_copy.tsx` · `actions.ts` | 내 주문표 화면 | 신규 |
| `apps/web/components/AssetTabs.tsx` | 「주문표」 탭 | 수정 |
| `apps/web/lib/data.ts` | 추격 손절 표시를 저장값으로 | 수정 |
| `apps/engine/.env.example` · `apps/web/.env.example` | 새 변수 이름 | 수정 |

---

### Task 1: DB 마이그레이션 0051

**Files:**
- Create: `supabase/migrations/0051_pick_follow_alerts.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 0051 픽 따라 하기 — 추격 손절 저장 · 할 일 목록 · 텔레그램 연결 · 발송 기록.
--
-- 2026-10-09 브레인스토밍(설계서 docs/superpowers/specs/2026-10-09-pick-follow-alerts-design.md).
-- 픽을 따라 하려면 회원이 매일 사이트에 와서 숫자를 챙겨야 했다. 특히 «추격 중» 픽의
-- 손절선은 매일 바뀌는데 저장조차 안 됐다 — 엔진과 웹이 각자 계산했다.
-- 원칙: 할 일 목록은 엔진이 한 번만 만든다. 텔레그램과 주문표는 읽기만 한다.

-- ── 추격 손절 — 엔진이 매일 저장, 모두가 읽는다 ──
alter table recommendations
  add column if not exists trail_stop      numeric,
  add column if not exists trail_stop_prev numeric,
  add column if not exists trail_stop_at   date;

comment on column recommendations.trail_stop is
  '목표 도달 뒤 유효 손절(고점 − 1R, 하한 진입가). 엔진 manage_picks 가 매일 갱신.';

-- ── 할 일 목록 ──
create table if not exists pick_actions (
  id                bigserial primary key,
  as_of             date   not null,          -- 이 목록을 만든 거래일(배치 기준일)
  for_date          date   not null,          -- 할 일을 실행하는 날(다음 거래일)
  recommendation_id bigint not null references recommendations(id) on delete cascade,
  instrument_id     bigint not null references instruments(id),
  kind              text   not null check (kind in ('buy','raise_stop','sell','closed')),
  entry_price       numeric,
  stop_price        numeric,
  target_price      numeric,
  price             numeric,                  -- raise_stop: 새 손절 / closed: 청산가
  prev_price        numeric,                  -- raise_stop: 직전 손절
  weight_pct        numeric,                  -- 권장 비중(%) — 손절 시 계좌 1%
  return_pct        numeric,                  -- closed: 확정 수익률
  status            text,                     -- closed: stopped|trailed|...
  created_at        timestamptz not null default now(),
  unique (as_of, recommendation_id, kind)
);
create index if not exists pick_actions_as_of on pick_actions(as_of desc);
alter table pick_actions enable row level security;
drop policy if exists pick_actions_read on pick_actions;
create policy pick_actions_read on pick_actions for select to authenticated using (true);

-- ── 투자 금액(주문표 수량 계산용) — profiles 의 기존 본인 update 정책을 탄다 ──
alter table profiles add column if not exists invest_amount bigint
  check (invest_amount is null or invest_amount between 100000 and 100000000000);

-- ── 비밀값 — 정책 없음 = 서버 함수(security definer)와 service role 만 읽는다 ──
create table if not exists app_secrets (
  key   text primary key,
  value text not null
);
alter table app_secrets enable row level security;

-- ── 텔레그램 연결 ──
create table if not exists telegram_links (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  chat_id   bigint not null unique,
  active    boolean not null default true,
  linked_at timestamptz not null default now()
);
alter table telegram_links enable row level security;
drop policy if exists telegram_links_select on telegram_links;
create policy telegram_links_select on telegram_links for select using (user_id = auth.uid());
drop policy if exists telegram_links_update on telegram_links;
create policy telegram_links_update on telegram_links for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists telegram_link_codes (
  code       text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz
);
alter table telegram_link_codes enable row level security;   -- 정책 없음

-- 로그인한 회원 → 10분짜리 일회용 코드. 이전 미사용 코드는 지운다.
create or replace function telegram_link_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  c := replace(gen_random_uuid()::text, '-', '');
  delete from telegram_link_codes where user_id = auth.uid() and used_at is null;
  insert into telegram_link_codes(code, user_id, expires_at)
  values (c, auth.uid(), now() + interval '10 minutes');
  return c;
end $$;
revoke all on function telegram_link_code() from public;
grant execute on function telegram_link_code() to authenticated;

-- 웹훅 → 코드 확인 후 연결. 웹훅 비밀값이 맞아야만 동작한다(웹에는 service role 이 없다).
create or replace function telegram_link(p_secret text, p_code text, p_chat_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if p_secret is null
     or p_secret is distinct from (select value from app_secrets where key = 'telegram_webhook') then
    raise exception 'forbidden';
  end if;
  update telegram_link_codes set used_at = now()
   where code = p_code and used_at is null and expires_at > now()
   returning user_id into u;
  if u is null then return false; end if;
  delete from telegram_links where chat_id = p_chat_id and user_id <> u;
  insert into telegram_links(user_id, chat_id, active, linked_at)
  values (u, p_chat_id, true, now())
  on conflict (user_id) do update
    set chat_id = excluded.chat_id, active = true, linked_at = now();
  return true;
end $$;
revoke all on function telegram_link(text, text, bigint) from public;
grant execute on function telegram_link(text, text, bigint) to anon, authenticated;

create or replace function telegram_unlink(p_secret text, p_chat_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null
     or p_secret is distinct from (select value from app_secrets where key = 'telegram_webhook') then
    raise exception 'forbidden';
  end if;
  update telegram_links set active = false where chat_id = p_chat_id;
end $$;
revoke all on function telegram_unlink(text, bigint) from public;
grant execute on function telegram_unlink(text, bigint) to anon, authenticated;

-- ── 발송 기록 — 같은 날 같은 사람에게 같은 종류를 두 번 보내지 않는다 ──
create table if not exists notification_outbox (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('evening','morning')),
  for_date   date not null,
  body       text not null,
  status     text not null default 'pending',   -- pending|sent|failed|blocked
  attempts   int  not null default 0,
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, for_date)
);
alter table notification_outbox enable row level security;   -- 정책 없음(엔진 service role 전용)
```

- [ ] **Step 2: 운영 DB 에 적용**

Run: `cd D:/Stock-Alpha && apps/engine/.venv/Scripts/python.exe scripts/apply_sql.py supabase/migrations/0051_pick_follow_alerts.sql`
Expected: 오류 없이 종료(한 트랜잭션, 실패 시 전부 롤백).

- [ ] **Step 3: 적용 확인**

Run:
```bash
cd D:/Stock-Alpha/apps/engine && .venv/Scripts/python.exe -c "
import psycopg; from engine.db_direct import _dsn
with psycopg.connect(_dsn()) as c:
    cur=c.cursor()
    cur.execute(\"select table_name from information_schema.tables where table_name in ('pick_actions','telegram_links','telegram_link_codes','notification_outbox','app_secrets') order by 1\"); print(cur.fetchall())
    cur.execute(\"select column_name from information_schema.columns where table_name='recommendations' and column_name like 'trail_stop%' order by 1\"); print(cur.fetchall())
"
```
Expected: 표 5개, 컬럼 `trail_stop`·`trail_stop_at`·`trail_stop_prev`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0051_pick_follow_alerts.sql
git commit -m "feat(db): 0051 픽 따라 하기 — 추격 손절·할 일 목록·텔레그램 연결·발송 기록"
```

---

### Task 2: 엔진 — 추격 손절을 저장한다

**Files:**
- Modify: `apps/engine/engine/reports/daily.py` (`PICK_JUDGE_FIELDS`, `resolve_pick_status` 의 trail 경로 끝, `manage_picks` 집계)
- Test: `apps/engine/tests/test_daily.py`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_daily.py` 끝에 추가

```python
# ── 추격 손절 저장 (2026-10-09 픽 따라 하기) ──
# 예전엔 «추격 중» 손절선을 저장하지 않아 엔진과 웹이 각자 계산했다.
# 이제 판정이 계산한 그 값을 그대로 저장하고, 주문표·알림·화면이 그 값을 읽는다.

def test_trail_stop_saved_on_transition():
    """목표에 처음 닿은 날 — 전환 기록과 함께 새 손절(고점 − 1R)과 직전 손절을 저장."""
    pick = _kepco_pick(tp1_hit=False, tp1_hit_at=None)
    bars = [{"low": 111000.0, "high": 125000.0, "close": 124000.0, "ts": "2026-08-26"}]
    out = rd.resolve_pick_status(pick, bars, date(2026, 8, 26))
    assert out["tp1_hit"] is True and out["tp1_hit_at"] == "2026-08-26"
    assert out["trail_stop"] == pytest.approx(117877.7)          # 125,000 − 7,122.3
    assert out["trail_stop_prev"] == pytest.approx(103077.7)     # 원래 손절
    assert out["trail_stop_at"] == "2026-08-26"
    assert "status" not in out                                    # 아직 안 닫힌다


def test_trail_stop_not_repatched_when_unchanged():
    """값이 그대로면 아무것도 쓰지 않는다(매일 같은 값을 덮어쓰지 않는다)."""
    pick = _kepco_pick(trail_stop=117877.7)
    bars = [{"low": 111000.0, "high": 125000.0, "close": 124000.0, "ts": "2026-08-26"}]
    assert rd.resolve_pick_status(pick, bars, date(2026, 8, 26)) is None


def test_trail_stop_raise_keeps_previous_value():
    """고점이 더 오르면 새 값과 함께 «직전 저장값»을 prev 로 남긴다(알림의 A → B)."""
    pick = _kepco_pick(trail_stop=117877.7)
    bars = [{"low": 111000.0, "high": 125000.0, "close": 124000.0, "ts": "2026-08-26"},
            {"low": 126000.0, "high": 130000.0, "close": 129000.0, "ts": "2026-08-27"}]
    out = rd.resolve_pick_status(pick, bars, date(2026, 8, 27))
    assert out["trail_stop"] == pytest.approx(122877.7)          # 130,000 − 7,122.3
    assert out["trail_stop_prev"] == pytest.approx(117877.7)
    assert out["trail_stop_at"] == "2026-08-27"


def test_judge_fields_include_trail_stop():
    """판정 입력에 trail_stop 이 빠지면 매일 «바뀌었다»로 읽혀 같은 값을 다시 쓴다."""
    assert "trail_stop" in rd.PICK_JUDGE_FIELDS
```

그리고 기존 `test_trail_falls_back_to_breakeven_when_stop_is_missing` 의 단언을 바꾼다(손절가가 없으면 추격 폭이 0 이라 유효 손절 = 진입가가 저장된다):

```python
def test_trail_falls_back_to_breakeven_when_stop_is_missing():
    """손절가가 없으면 되돌림 폭을 못 구한다 — 옛 본전스톱으로 물러선다."""
    pick = _kepco_pick(stop_loss=None)
    out = rd.resolve_pick_status(pick, _KEPCO_BARS, date(2026, 8, 27))
    assert (out is None or out.get("status") == "breakeven"
            or out.get("trail_stop") == pytest.approx(110200.0))
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_daily.py -q -k "trail_stop or judge_fields"`
Expected: `test_trail_stop_saved_on_transition`·`test_trail_stop_raise_keeps_previous_value`·`test_judge_fields_include_trail_stop` FAIL (KeyError 'trail_stop' / assert).

- [ ] **Step 3: 구현**

`PICK_JUDGE_FIELDS` 튜플에 `"trail_stop"` 를 추가한다:

```python
PICK_JUDGE_FIELDS: tuple[str, ...] = (
    "id", "as_of", "entry_price", "target_price", "tp2_price", "stop_loss",
    "tp1_hit", "tp1_hit_at", "style", "setup", "horizon", "instrument_id",
    "entry_rule", "confirmed_at", "trail_stop",
)
```

`resolve_pick_status` 의 trail 경로 끝(현재 코드):

```python
        if trailed and not pick.get("tp1_hit"):
            # 비종결 — 전환됐다는 사실만 기록한다(다음 배치가 이어서 본다).
            return {"tp1_hit": True, "tp1_hit_at": today.isoformat()}
        return None
```

를 다음으로 바꾼다:

```python
        if trailed:
            # 비종결 — 전환 기록 + 오늘 기준 유효 손절을 저장한다(2026-10-09).
            # 주문표·텔레그램·화면이 이 값을 읽는다. 예전엔 저장하지 않아 엔진과 웹이
            # 각자 계산했다 — 같은 값을 세 곳에서 따로 구하면 언젠가 갈라진다.
            patch: dict = {}
            if not pick.get("tp1_hit"):
                patch.update({"tp1_hit": True, "tp1_hit_at": today.isoformat()})
            new_stop = round(float(eff_stop), 4)
            old = pick.get("trail_stop")
            if old is None or abs(float(old) - new_stop) > 1e-6:
                # 직전 손절 — 알림의 «A → B» 의 A. 첫 저장이면 회원이 걸어 둔 손절이다:
                # 이미 전환된 채 들어온 픽은 진입가(본전), 오늘 전환이면 원래 손절.
                if old is not None:
                    prev = float(old)
                elif pick.get("tp1_hit"):
                    prev = e
                else:
                    prev = s
                patch.update({"trail_stop": new_stop, "trail_stop_prev": prev,
                              "trail_stop_at": today.isoformat()})
            return patch or None
        return None
```

`manage_picks` — 집계 초기값에 `"trail_raised": 0` 을 넣고 비종결 분기를 바꾼다:

```python
    counts = {"target": 0, "stopped": 0, "trailed": 0, "breakeven": 0,
              "expired": 0, "partial": 0, "unfilled": 0, "voided": 0,
              "tp1_hit": 0, "trail_raised": 0, "open": 0}
```

```python
        else:                                  # 비종결 — 전환 기록·추격 손절 갱신
            if "tp1_hit" in patch:
                counts["tp1_hit"] += 1
            if "trail_stop" in patch:
                counts["trail_raised"] += 1
            counts["open"] += 1
```

- [ ] **Step 4: 통과 확인 + 전체 회귀**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests -q`
Expected: 전부 PASS. 만약 기존 테스트 중 «이미 전환된 열린 픽 → `None`» 을 단언하는 것이 실패하면, 그 픽의 `trail_stop` 이 미저장(None)이라 첫 저장 패치가 나온 것이다. 그 테스트의 픽 dict 에 판정이 계산하는 값(`trail_stop=<기대 유효 손절>`)을 넣어 «값이 그대로면 None» 을 유지하도록 고친다 — 단언 자체(None)는 바꾸지 않는다.

- [ ] **Step 5: Commit**

```bash
git add apps/engine/engine/reports/daily.py apps/engine/tests/test_daily.py
git commit -m "feat(engine): 추격 손절을 recommendations.trail_stop 에 저장 — 엔진·웹 이중 계산 제거 준비"
```

---

### Task 3: 엔진 — 할 일 목록 생성(순수 함수)

**Files:**
- Create: `apps/engine/engine/notify/__init__.py` (빈 파일, docstring 한 줄)
- Create: `apps/engine/engine/notify/actions.py`
- Test: `apps/engine/tests/test_notify.py`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_notify.py`

```python
"""픽 따라 하기 — 할 일 목록·문구·발송 (2026-10-09 설계서)."""
from __future__ import annotations

from datetime import date

import pytest

from engine.notify import actions as act

HOL: set[date] = {date(2026, 10, 9)}          # 한글날(금) 휴장


def _pick(**over) -> dict:
    p = {"id": 1, "instrument_id": 10, "status": "open", "as_of": "2026-10-07",
         "confirmed_at": "2026-10-08", "entry_price": 10000.0, "stop_loss": 9000.0,
         "target_price": 12000.0, "horizon": "short", "setup": "breakout",
         "style": "swing", "trail_stop": None, "trail_stop_prev": None,
         "trail_stop_at": None, "closed_at": None, "exit_price": None,
         "close_return_pct": None}
    p.update(over)
    return p


def test_due_date_counts_entry_day_as_first_and_skips_holidays():
    # 10/8(목) 진입, 5거래일 → 10/8, 10/12, 10/13, 10/14, 10/15 (10/9 휴장·주말 제외)
    assert act.due_date(date(2026, 10, 8), 5, HOL) == date(2026, 10, 15)
    assert act.due_date(date(2026, 10, 8), 1, HOL) == date(2026, 10, 8)


def test_buy_for_todays_pending_pick():
    p = _pick(status="pending", as_of="2026-10-08", confirmed_at=None)
    rows = act.build_actions(as_of=date(2026, 10, 8), for_date=date(2026, 10, 12),
                             picks=[p], holidays=HOL)
    assert len(rows) == 1
    r = rows[0]
    assert r["kind"] == "buy" and r["recommendation_id"] == 1
    assert r["entry_price"] == 10000.0 and r["stop_price"] == 9000.0
    assert r["weight_pct"] == pytest.approx(10.0)      # 손절 -10% → 비중 10%(계좌 1%)
    assert r["for_date"] == "2026-10-12" and r["as_of"] == "2026-10-08"


def test_old_pending_pick_is_not_a_new_buy():
    p = _pick(status="pending", as_of="2026-10-07", confirmed_at=None)
    assert act.build_actions(as_of=date(2026, 10, 8), for_date=date(2026, 10, 12),
                             picks=[p], holidays=HOL) == []


def test_raise_stop_only_when_raised_today():
    up = _pick(trail_stop=10500.0, trail_stop_prev=9000.0, trail_stop_at="2026-10-08")
    old = _pick(id=2, trail_stop=10500.0, trail_stop_prev=9000.0, trail_stop_at="2026-10-07")
    same = _pick(id=3, trail_stop=10000.0, trail_stop_prev=10000.0, trail_stop_at="2026-10-08")
    rows = act.build_actions(as_of=date(2026, 10, 8), for_date=date(2026, 10, 12),
                             picks=[up, old, same], holidays=HOL)
    raises = [r for r in rows if r["kind"] == "raise_stop"]
    assert [r["recommendation_id"] for r in raises] == [1]
    assert raises[0]["price"] == 10500.0 and raises[0]["prev_price"] == 9000.0


def test_sell_on_due_date():
    # short=5거래일, 10/6(월) 진입 → 10/6,7,8,12,13 → 10/13 이 기한
    p = _pick(confirmed_at="2026-10-06")
    rows = act.build_actions(as_of=date(2026, 10, 12), for_date=date(2026, 10, 13),
                             picks=[p], holidays=HOL)
    assert [r["kind"] for r in rows] == ["sell"]
    rows = act.build_actions(as_of=date(2026, 10, 8), for_date=date(2026, 10, 12),
                             picks=[p], holidays=HOL)
    assert rows == []


def test_closed_today():
    p = _pick(status="stopped", closed_at="2026-10-08", exit_price=9000.0,
              close_return_pct=-0.1)
    rows = act.build_actions(as_of=date(2026, 10, 8), for_date=date(2026, 10, 12),
                             picks=[p], holidays=HOL)
    assert rows[0]["kind"] == "closed" and rows[0]["status"] == "stopped"
    assert rows[0]["price"] == 9000.0 and rows[0]["return_pct"] == -0.1


def test_actions_are_ordered_buy_raise_sell_closed():
    ps = [_pick(id=4, status="stopped", closed_at="2026-10-12", exit_price=9000.0,
                close_return_pct=-0.1),
          _pick(id=3, confirmed_at="2026-10-06"),
          _pick(id=2, trail_stop=10500.0, trail_stop_prev=9000.0, trail_stop_at="2026-10-12"),
          _pick(id=1, status="pending", as_of="2026-10-12", confirmed_at=None)]
    rows = act.build_actions(as_of=date(2026, 10, 12), for_date=date(2026, 10, 13),
                             picks=ps, holidays=HOL)
    assert [r["kind"] for r in rows] == ["buy", "raise_stop", "sell", "closed"]
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_notify.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'engine.notify'`

- [ ] **Step 3: 구현**

`apps/engine/engine/notify/__init__.py`:

```python
"""픽 따라 하기 — 할 일 목록 · 메시지 · 텔레그램 발송 (2026-10-09)."""
```

`apps/engine/engine/notify/actions.py`:

```python
"""픽 «할 일» 목록 — 텔레그램과 「내 주문표」가 읽는 단일 출처.

엔진이 일일 배치 끝에 한 번 만든다. 화면·메시지가 각자 계산하면 언젠가 숫자가
갈라진다(홈과 성과 화면이 다른 말을 했던 사고). 그래서 여기서만 만든다.

  buy         오늘 발행된 픽 → 다음 거래일 시가 매수 (+ 손절 주문)
  raise_stop  오늘 추격 손절이 올라간 픽 → 손절 주문 수정 A → B
  sell        다음 거래일이 청산 기한인 픽 → 그날 종가 전량 매도
  closed      오늘 끝난 거래 → 결과 보고
"""
from __future__ import annotations

from datetime import date

from engine.market import calendar as cal

TERMINAL = ("stopped", "trailed", "breakeven", "expired", "target")
_ORDER = {"buy": 0, "raise_stop": 1, "sell": 2, "closed": 3}


def _d(v) -> date | None:
    return date.fromisoformat(str(v)[:10]) if v else None


def _f(v) -> float | None:
    return None if v is None else float(v)


def pick_bars(pick: dict) -> int:
    """보유 상한(거래일 수) — 판정(resolve_pick_status)과 같은 출처를 쓴다."""
    if pick.get("horizon"):
        from engine.signals.horizons import get_profile
        return get_profile(pick["horizon"], pick.get("setup")).bars
    from engine.reports.daily import _TIMEOUT_BARS
    return _TIMEOUT_BARS.get(pick.get("style"), 10)


def due_date(confirmed_at: date, bars: int, holidays) -> date:
    """진입 봉을 1거래일째로 세어 bars 번째 거래일 — 그날 종가에 청산한다."""
    d = cal.next_trading_day(confirmed_at, holidays, include_self=True)
    for _ in range(max(bars, 1) - 1):
        d = cal.next_trading_day(d, holidays)
    return d


def build_actions(*, as_of: date, for_date: date, picks: list[dict],
                  holidays) -> list[dict]:
    """픽 행들 → 할 일 행들 (순수). 정렬: 사기 → 손절 올리기 → 팔기 → 끝난 거래."""
    from engine.reports.daily import position_size_pct

    out: list[dict] = []
    for p in picks:
        entry, stop = _f(p.get("entry_price")), _f(p.get("stop_loss"))
        base = {
            "as_of": as_of.isoformat(), "for_date": for_date.isoformat(),
            "recommendation_id": p["id"], "instrument_id": p["instrument_id"],
            "entry_price": entry, "stop_price": stop,
            "target_price": _f(p.get("target_price")),
            "weight_pct": round(position_size_pct(entry, stop), 4),
            "price": None, "prev_price": None, "return_pct": None, "status": None,
        }
        st = p.get("status")
        if st == "pending" and _d(p.get("as_of")) == as_of:
            out.append({**base, "kind": "buy"})
            continue
        if st == "open":
            ts, prev = _f(p.get("trail_stop")), _f(p.get("trail_stop_prev"))
            if (_d(p.get("trail_stop_at")) == as_of and ts is not None
                    and (prev is None or ts > prev)):
                out.append({**base, "kind": "raise_stop", "price": ts, "prev_price": prev})
            ca = _d(p.get("confirmed_at"))
            if ca and due_date(ca, pick_bars(p), holidays) == for_date:
                out.append({**base, "kind": "sell"})
            continue
        if st in TERMINAL and _d(p.get("closed_at")) == as_of:
            out.append({**base, "kind": "closed", "status": st,
                        "price": _f(p.get("exit_price")),
                        "return_pct": _f(p.get("close_return_pct"))})
    out.sort(key=lambda r: (_ORDER[r["kind"]], r["recommendation_id"]))
    return out
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_notify.py -q`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/engine/notify apps/engine/tests/test_notify.py
git commit -m "feat(engine): 픽 할 일 목록 생성기(buy·raise_stop·sell·closed) — 단일 출처"
```

---

### Task 4: 엔진 — 할 일 목록을 DB 에 쓰고 일일 배치에 연결

**Files:**
- Modify: `apps/engine/engine/notify/actions.py` (끝에 `write_actions` 추가)
- Modify: `apps/engine/engine/cli.py` (`daily` 의 `[5/5] reports` 출력 바로 뒤)
- Test: `apps/engine/tests/test_notify.py`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_notify.py` 끝에 추가

```python
def test_select_picks_window_covers_needed_rows():
    """DB 에서 읽을 픽 범위: 진행 중·대기 전부 + 오늘 닫힌 것."""
    q = act.picks_filter(date(2026, 10, 8))
    assert q == {"open_statuses": ("pending", "open"), "closed_on": "2026-10-08"}
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_notify.py -q -k window`
Expected: FAIL — `AttributeError: ... has no attribute 'picks_filter'`

- [ ] **Step 3: 구현** — `actions.py` 끝에 추가

```python
_PICK_COLS = ("id,instrument_id,status,as_of,confirmed_at,entry_price,stop_loss,"
              "target_price,horizon,setup,style,trail_stop,trail_stop_prev,"
              "trail_stop_at,closed_at,exit_price,close_return_pct")


def picks_filter(as_of: date) -> dict:
    """write_actions 가 읽는 픽 범위 (테스트용으로 분리한 순수 함수)."""
    return {"open_statuses": ("pending", "open"), "closed_on": as_of.isoformat()}


def write_actions(as_of: str) -> int:
    """as_of 거래일의 할 일 목록을 다시 만든다(멱등 — 같은 날 재실행해도 같은 결과)."""
    from engine.db import get_client
    from engine.logging import get_logger
    from engine.market.calendar_store import load_holidays

    log = get_logger(__name__)
    d = date.fromisoformat(as_of)
    holidays = load_holidays()
    for_date = cal.next_trading_day(d, holidays)
    f = picks_filter(d)
    cli = get_client()
    live = (cli.table("recommendations").select(_PICK_COLS)
            .eq("basket_type", "daily_focus").in_("status", list(f["open_statuses"]))
            .execute().data or [])
    closed = (cli.table("recommendations").select(_PICK_COLS)
              .eq("basket_type", "daily_focus").eq("closed_at", f["closed_on"])
              .execute().data or [])
    rows = build_actions(as_of=d, for_date=for_date, picks=live + closed,
                         holidays=holidays)
    cli.table("pick_actions").delete().eq("as_of", as_of).execute()
    if rows:
        cli.table("pick_actions").insert(rows).execute()
    log.info("notify.actions.written", as_of=as_of, for_date=for_date.isoformat(),
             rows=len(rows))
    return len(rows)
```

`cli.py` — `daily` 안의 다음 코드 바로 뒤에:

```python
    r = rd.run_daily(use_llm=llm, cap=cap, as_of=as_of)
    typer.echo(
        f"[5/5] reports — A:{r['track_a']} B:{r['track_b']} "
        f"published:{r['published']} skipped:{r['skipped']} picks:{r['picks']}"
    )
```

다음을 넣는다:

```python
    # 할 일 목록 — 픽 판정·발행이 끝난 직후. 텔레그램·주문표가 이것만 읽는다.
    try:
        from engine.notify import actions as na
        typer.echo(f"      pick actions: {na.write_actions(target)} rows")
    except Exception as e:  # noqa: BLE001 — 알림 준비 실패가 배치를 죽이지 않는다
        log.warning("daily.pick_actions.failed", error=str(e))
        typer.echo(f"      pick actions: 실패 — {e}")
```

(`target` 은 `daily` 안에서 뉴스 대상 조회에 쓰는 바로 그 거래일 문자열이다 — `grep -n "target =" apps/engine/engine/cli.py` 로 정의 위치를 확인한다.)

- [ ] **Step 4: 통과 + 실제 1회 실행**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests -q`
Expected: 전부 PASS

Run: `cd apps/engine && .venv/Scripts/python.exe -c "from engine.notify.actions import write_actions; print(write_actions('2026-10-08'))"`
Expected: 정수(오늘 홈 기준 buy 2건 + 기타). `pick_actions` 에 `as_of=2026-10-08` 행이 생긴다.

- [ ] **Step 5: Commit**

```bash
git add apps/engine/engine/notify/actions.py apps/engine/engine/cli.py apps/engine/tests/test_notify.py
git commit -m "feat(engine): 일일 배치 끝에 pick_actions 기록"
```

---

### Task 5: 엔진 — 메시지 문구(순수 함수)

**Files:**
- Create: `apps/engine/engine/notify/messages.py`
- Test: `apps/engine/tests/test_notify.py`

- [ ] **Step 1: 실패하는 테스트 작성** — 끝에 추가

```python
from engine.notify import messages as msg

NAMES = {10: "비에이치", 11: "저스템", 12: "DB손해보험", 13: "대한항공"}


def _row(kind, iid, **kw):
    r = {"kind": kind, "instrument_id": iid, "entry_price": 22000.0,
         "stop_price": 19191.0, "target_price": 25121.0, "weight_pct": 7.8,
         "price": None, "prev_price": None, "return_pct": None, "status": None}
    r.update(kw)
    return r


def test_evening_text_sections_in_order():
    rows = [_row("buy", 10), _row("raise_stop", 11, price=19420.0, prev_price=18533.0),
            _row("sell", 12), _row("closed", 13, status="stopped", return_pct=-0.035)]
    t = msg.evening_text(date(2026, 10, 12), rows, NAMES)
    assert t.startswith("VECTA · 10월 12일(월) 할 일")
    i_buy, i_raise = t.index("새로 사기"), t.index("손절 올리기")
    i_sell, i_closed = t.index("팔기"), t.index("오늘 끝난 거래")
    assert i_buy < i_raise < i_sell < i_closed
    assert "비에이치  손절 19,191  목표 25,121  비중 7.8%" in t
    assert "저스템  18,533 → 19,420 으로 수정" in t
    assert "DB손해보험  10월 12일(월) 종가에 전량" in t
    assert "대한항공  손절 -3.5%" in t
    assert t.rstrip().endswith(msg.DISCLAIMER)


def test_evening_text_quiet_day():
    t = msg.evening_text(date(2026, 10, 12), [], NAMES)
    assert "오늘은 할 일이 없습니다" in t


def test_morning_text_only_when_buys():
    assert msg.morning_text([_row("sell", 12)], NAMES) is None
    t = msg.morning_text([_row("buy", 10), _row("buy", 13)], NAMES)
    assert t.startswith("오늘 시가 매수 2건 · 비에이치 · 대한항공")
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_notify.py -q -k text`
Expected: FAIL — `ImportError: cannot import name 'messages'`

- [ ] **Step 3: 구현** — `apps/engine/engine/notify/messages.py`

```python
"""텔레그램 메시지 문구 — 순수 함수. 숫자는 pick_actions 값 그대로 쓴다(재계산 금지)."""
from __future__ import annotations

from datetime import date

DISCLAIMER = "투자 판단의 책임은 본인에게 있습니다 · VECTA"
_WD = "월화수목금토일"
_CLOSED = {"stopped": "손절", "trailed": "추격 청산", "breakeven": "본전 청산",
           "expired": "기한 청산", "target": "목표"}


def day_label(d: date) -> str:
    return f"{d.month}월 {d.day}일({_WD[d.weekday()]})"


def _won(v) -> str:
    return "—" if v is None else f"{round(float(v)):,}"


def evening_text(for_date: date, rows: list[dict], names: dict[int, str]) -> str:
    head = f"VECTA · {day_label(for_date)} 할 일"
    if not rows:
        return f"{head}\n\n오늘은 할 일이 없습니다.\n\n{DISCLAIMER}"
    by: dict[str, list[dict]] = {}
    for r in rows:
        by.setdefault(r["kind"], []).append(r)
    nm = lambda r: names.get(r["instrument_id"], str(r["instrument_id"]))  # noqa: E731
    parts = [head]
    if by.get("buy"):
        parts.append(f"🟢 새로 사기 ({_WD[for_date.weekday()]} 시가)\n" + "\n".join(
            f" {nm(r)}  손절 {_won(r['stop_price'])}  목표 {_won(r['target_price'])}"
            f"  비중 {float(r['weight_pct'] or 0):.1f}%" for r in by["buy"]))
    if by.get("raise_stop"):
        parts.append("🔼 손절 올리기 (추격 중)\n" + "\n".join(
            f" {nm(r)}  {_won(r['prev_price'])} → {_won(r['price'])} 으로 수정"
            for r in by["raise_stop"]))
    if by.get("sell"):
        parts.append("🔴 팔기\n" + "\n".join(
            f" {nm(r)}  {day_label(for_date)} 종가에 전량 (청산 기한)" for r in by["sell"]))
    if by.get("closed"):
        parts.append("📌 오늘 끝난 거래\n" + "\n".join(
            f" {nm(r)}  {_CLOSED.get(r['status'], r['status'])} "
            f"{float(r['return_pct'] or 0) * 100:+.1f}%" for r in by["closed"]))
    parts.append(DISCLAIMER)
    return "\n\n".join(parts)


def morning_text(rows: list[dict], names: dict[int, str]) -> str | None:
    buys = [r for r in rows if r["kind"] == "buy"]
    if not buys:
        return None
    ns = " · ".join(names.get(r["instrument_id"], str(r["instrument_id"])) for r in buys)
    return (f"오늘 시가 매수 {len(buys)}건 · {ns}\n"
            f"손절 주문 가격은 내 주문표에서 복사하세요\n\n{DISCLAIMER}")
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_notify.py -q`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/engine/engine/notify/messages.py apps/engine/tests/test_notify.py
git commit -m "feat(engine): 저녁·아침 알림 문구"
```

---

### Task 6: 엔진 — 텔레그램 발송·재시도·차단 처리·운영 알림

**Files:**
- Modify: `apps/engine/engine/config.py` (Settings 에 필드 3개)
- Create: `apps/engine/engine/notify/telegram.py`
- Modify: `apps/engine/.env.example`
- Test: `apps/engine/tests/test_notify.py`

- [ ] **Step 1: 설정 추가** — `config.py` 의 `Settings` 안, `supabase_db_url` 아래에:

```python
    # 텔레그램(2026-10-09 픽 따라 하기). 토큰은 엔진 전용 — 웹·클라이언트에 두지 않는다.
    telegram_bot_token: str = Field(default="", alias="TELEGRAM_BOT_TOKEN")
    telegram_webhook_secret: str = Field(default="", alias="TELEGRAM_WEBHOOK_SECRET")
    # admins = 시범 운영(운영자만 받음) · members = 연결한 회원 전체
    telegram_audience: str = Field(default="admins", alias="TELEGRAM_AUDIENCE")
```

`.env.example`(apps/engine) 끝에:

```
# 텔레그램 — 픽 따라 하기 알림 (BotFather 발급, 커밋 금지)
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_AUDIENCE=admins
```

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/test_notify.py` 끝에 추가

```python
from engine.notify import telegram as tg


class FakeHttp:
    """Bot API 대역 — 호출을 기록하고, 정해 둔 상태 코드를 차례로 돌려준다."""
    def __init__(self, codes):
        self.codes, self.calls = list(codes), []

    def __call__(self, method, payload):
        self.calls.append((method, payload))
        return self.codes.pop(0) if self.codes else 200


def test_send_with_retry_succeeds_after_transient_failure():
    http = FakeHttp([500, 200])
    assert tg.send_with_retry(http, 42, "hi", button_url=None) == "sent"
    assert len(http.calls) == 2


def test_send_with_retry_gives_up_after_three():
    http = FakeHttp([500, 500, 500, 500])
    assert tg.send_with_retry(http, 42, "hi", button_url=None) == "failed"
    assert len(http.calls) == 3


def test_send_with_retry_marks_blocked_on_403_without_retry():
    http = FakeHttp([403])
    assert tg.send_with_retry(http, 42, "hi", button_url=None) == "blocked"
    assert len(http.calls) == 1


def test_button_is_attached():
    http = FakeHttp([200])
    tg.send_with_retry(http, 42, "hi", button_url="https://vecta.win/orders")
    payload = http.calls[0][1]
    assert payload["reply_markup"]["inline_keyboard"][0][0]["url"] == "https://vecta.win/orders"


def test_skip_users_already_sent():
    links = [{"user_id": "a", "chat_id": 1}, {"user_id": "b", "chat_id": 2}]
    assert tg.pending_recipients(links, already_sent={"a"}) == [{"user_id": "b", "chat_id": 2}]
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_notify.py -q -k "retry or button or already"`
Expected: FAIL — `ImportError: cannot import name 'telegram'`

- [ ] **Step 4: 구현** — `apps/engine/engine/notify/telegram.py`

```python
"""텔레그램 발송 — Bot API 호출 · 재시도 · 차단 처리 · 운영 알림.

토큰은 엔진(운영 PC)에만 있다. 웹은 웹훅 응답 본문으로만 답장한다(토큰 불필요).
같은 날 같은 사람에게 같은 종류를 두 번 보내지 않는다 — notification_outbox
unique(user_id, kind, for_date). 배치를 다시 돌려도 안전하다.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone
from typing import Callable

from engine.logging import get_logger

log = get_logger(__name__)

KST = timezone(timedelta(hours=9))
SITE = "https://vecta.win"
MAX_TRIES = 3

Http = Callable[[str, dict], int]   # (method, payload) → HTTP 상태 코드


def make_http(token: str) -> Http:
    import httpx

    def call(method: str, payload: dict) -> int:
        try:
            r = httpx.post(f"https://api.telegram.org/bot{token}/{method}",
                           json=payload, timeout=20)
            return r.status_code
        except Exception as e:  # noqa: BLE001 — 네트워크 오류는 재시도 대상
            log.warning("telegram.http_error", error=str(e)[:140])
            return 599
    return call


def send_with_retry(http: Http, chat_id: int, text: str, *,
                    button_url: str | None) -> str:
    """→ 'sent' | 'blocked'(403, 재시도 없음) | 'failed'(3회 실패)."""
    payload: dict = {"chat_id": chat_id, "text": text,
                     "disable_web_page_preview": True}
    if button_url:
        payload["reply_markup"] = {"inline_keyboard": [[
            {"text": "내 주문표 열기", "url": button_url}]]}
    for i in range(MAX_TRIES):
        code = http("sendMessage", payload)
        if code == 200:
            return "sent"
        if code == 403:
            return "blocked"
        if i + 1 < MAX_TRIES:
            time.sleep(1.5 * (i + 1))
    return "failed"


def pending_recipients(links: list[dict], already_sent: set[str]) -> list[dict]:
    return [l for l in links if l["user_id"] not in already_sent]


def _links(audience: str) -> list[dict]:
    """발송 대상 — 연결이 살아 있는 회원. 시범 운영(admins)이면 운영자만."""
    from engine.db import get_client
    cli = get_client()
    links = (cli.table("telegram_links").select("user_id,chat_id")
             .eq("active", True).execute().data or [])
    if audience == "members":
        return links
    admins = {r["id"] for r in (cli.table("profiles").select("id")
                                .eq("is_admin", True).execute().data or [])}
    return [l for l in links if l["user_id"] in admins]


def deliver(kind: str, for_date: date, text: str, *,
            button_url: str | None = f"{SITE}/orders") -> dict[str, int]:
    """회원 발송 — outbox 로 중복을 막고, 결과를 기록한다."""
    from engine.config import get_settings
    from engine.db import get_client

    st = get_settings()
    counts = {"sent": 0, "failed": 0, "blocked": 0, "skipped": 0}
    if not st.telegram_bot_token:
        log.warning("telegram.no_token")
        return counts
    http = make_http(st.telegram_bot_token)
    cli = get_client()
    fd = for_date.isoformat()
    done = {r["user_id"] for r in (cli.table("notification_outbox").select("user_id")
            .eq("kind", kind).eq("for_date", fd).eq("status", "sent")
            .execute().data or [])}
    links = _links(st.telegram_audience)
    counts["skipped"] = len(links) - len(pending_recipients(links, done))
    failed_users: list[str] = []
    for l in pending_recipients(links, done):
        cli.table("notification_outbox").upsert(
            {"user_id": l["user_id"], "kind": kind, "for_date": fd, "body": text,
             "status": "pending"}, on_conflict="user_id,kind,for_date").execute()
        res = send_with_retry(http, int(l["chat_id"]), text, button_url=button_url)
        patch: dict = {"status": res, "attempts": MAX_TRIES if res == "failed" else 1}
        if res == "sent":
            patch["sent_at"] = datetime.now(timezone.utc).isoformat()
        cli.table("notification_outbox").update(patch).eq("user_id", l["user_id"]) \
            .eq("kind", kind).eq("for_date", fd).execute()
        if res == "blocked":
            cli.table("telegram_links").update({"active": False}) \
                .eq("user_id", l["user_id"]).execute()
        if res == "failed":
            failed_users.append(l["user_id"])
        counts[res] += 1
    if failed_users:
        send_ops(f"⚠️ {kind} 알림 발송 실패 {len(failed_users)}명 ({fd})")
    log.info("telegram.deliver", kind=kind, for_date=fd, **counts)
    return counts


def send_ops(text: str) -> int:
    """운영 알림 — 운영자(is_admin)의 연결된 채팅으로. outbox 를 쓰지 않는다(하루 여러 번 가능).

    알림 실패가 배치를 죽이면 안 된다 — 예외를 삼키고 보낸 수만 돌려준다.
    """
    try:
        from engine.config import get_settings
        st = get_settings()
        if not st.telegram_bot_token:
            return 0
        http = make_http(st.telegram_bot_token)
        n = 0
        for l in _links("admins"):
            if send_with_retry(http, int(l["chat_id"]), f"[VECTA 운영] {text}",
                               button_url=None) == "sent":
                n += 1
        return n
    except Exception as e:  # noqa: BLE001
        log.warning("telegram.ops_failed", error=str(e)[:140])
        return 0


def now_kst() -> datetime:
    return datetime.now(KST)
```

- [ ] **Step 5: 통과 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_notify.py -q`
Expected: 전부 PASS (재시도 테스트는 sleep 때문에 수 초 걸린다)

- [ ] **Step 6: Commit**

```bash
git add apps/engine/engine/config.py apps/engine/engine/notify/telegram.py apps/engine/.env.example apps/engine/tests/test_notify.py
git commit -m "feat(engine): 텔레그램 발송·재시도·차단 처리·운영 알림"
```

---

### Task 7: 엔진 — `notify` 명령 · 23시 규칙 · 워커 연결 · 실패/뉴스 운영 알림

**Files:**
- Modify: `apps/engine/engine/cli.py` (새 명령 `notify`, 워커 `jobs`·`run_job`)
- Modify: `apps/engine/engine/ingest/naver_news.py` (`all_empty` → 운영 알림)
- Test: `apps/engine/tests/test_notify.py`

- [ ] **Step 1: 실패하는 테스트 작성** — 끝에 추가

```python
def test_evening_is_late_after_23_kst():
    from datetime import datetime
    assert tg.evening_too_late(datetime(2026, 10, 12, 23, 0, tzinfo=tg.KST))
    assert not tg.evening_too_late(datetime(2026, 10, 12, 22, 59, tzinfo=tg.KST))
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests/test_notify.py -q -k late`
Expected: FAIL — `AttributeError: ... 'evening_too_late'`

- [ ] **Step 3: 구현**

`telegram.py` 끝에:

```python
EVENING_CUTOFF_HOUR = 23


def evening_too_late(now: datetime) -> bool:
    """23시(KST) 이후면 회원 발송을 하지 않는다 — 틀린 할 일보다 무발송이 낫다."""
    return now.astimezone(KST).hour >= EVENING_CUTOFF_HOUR
```

`cli.py` — `@app.command("ingest-news")` 위에 새 명령을 추가:

```python
@app.command("notify")
def notify(
    kind: str = typer.Argument(..., help="evening | morning"),
    force: bool = typer.Option(False, help="23시 규칙 무시(수동 재발송용)"),
) -> None:
    """픽 따라 하기 알림 — pick_actions 를 읽어 텔레그램으로 보낸다(2026-10-09).

    evening: 일일 배치 직후. 가장 최근 as_of 의 할 일을 for_date 기준으로 묶어 1통.
    morning: 모닝 배치 맨 앞(08:30 KST). 오늘 시가 매수가 있을 때만.
    """
    from engine.db import get_client
    from engine.market import calendar as mcal
    from engine.market.calendar_store import load_holidays
    from engine.notify import messages as nm
    from engine.notify import telegram as tg

    cli_db = get_client()
    now = tg.now_kst()
    if kind == "evening":
        if tg.evening_too_late(now) and not force:
            tg.send_ops("오늘 저녁 알림 지연 — 23시(KST)를 넘겨 회원 발송을 생략했습니다")
            typer.echo("notify evening: 23시 이후 — 생략")
            return
        latest = (cli_db.table("pick_actions").select("as_of,for_date")
                  .order("as_of", desc=True).limit(1).execute().data or [])
        basis = mcal.prev_trading_day(now.date(), load_holidays(), include_self=True)
        if not latest or latest[0]["as_of"] != basis.isoformat():
            # 할 일 0건인 날도 as_of 행이 없다 → 오늘 픽 발행이 있었는지로 구분한다.
            n_pub = len(cli_db.table("recommendations").select("id")
                        .eq("basket_type", "daily_focus").eq("as_of", basis.isoformat())
                        .execute().data or [])
            if n_pub:
                tg.send_ops(f"할 일 목록이 오늘({basis}) 것이 아닙니다 — 저녁 알림 생략")
                typer.echo("notify evening: 할 일 목록 없음 — 생략")
                return
            for_date = mcal.next_trading_day(basis, load_holidays())
            rows: list[dict] = []
        else:
            for_date = date.fromisoformat(latest[0]["for_date"])
            rows = (cli_db.table("pick_actions").select("*")
                    .eq("as_of", latest[0]["as_of"]).execute().data or [])
        # 픽이 이틀 연속 0건이면 운영자에게 — 게이트·데이터 이상일 수 있다(설계서 ②).
        prev = mcal.prev_trading_day(basis, load_holidays())
        n_two = len(cli_db.table("recommendations").select("id")
                    .eq("basket_type", "daily_focus")
                    .in_("as_of", [basis.isoformat(), prev.isoformat()])
                    .execute().data or [])
        if n_two == 0:
            tg.send_ops(f"픽 0건이 이틀 연속입니다({prev}, {basis}) — 게이트·데이터 확인")
        text = nm.evening_text(for_date, rows, _instrument_names(rows))
        typer.echo(f"notify evening: {tg.deliver('evening', for_date, text)}")
        return
    if kind == "morning":
        today = now.date()
        if not mcal.is_trading_day(today, load_holidays()):
            typer.echo("notify morning: 휴장일 — 생략")
            return
        rows = (cli_db.table("pick_actions").select("*")
                .eq("for_date", today.isoformat()).eq("kind", "buy")
                .execute().data or [])
        text = nm.morning_text(rows, _instrument_names(rows))
        if text is None:
            typer.echo("notify morning: 매수 없음 — 생략")
            return
        typer.echo(f"notify morning: {tg.deliver('morning', today, text)}")
        return
    typer.echo("kind 는 evening | morning")
    raise typer.Exit(2)


def _instrument_names(rows: list[dict]) -> dict[int, str]:
    from engine.db import get_client
    ids = sorted({int(r["instrument_id"]) for r in rows})
    if not ids:
        return {}
    data = (get_client().table("instruments").select("id,name").in_("id", ids)
            .execute().data or [])
    return {int(d["id"]): d["name"] for d in data}
```

(`date` 가 cli.py 상단에서 import 되어 있지 않으면 `from datetime import date` 를 함수 안에 추가한다 — `grep -n "^from datetime" apps/engine/engine/cli.py` 로 확인.)

워커 `jobs` — morning 과 daily 를 다음으로 바꾼다:

```python
        {"name": "morning", "hh": 8, "mm": 30, "logbase": "morning",
         # 리마인더를 맨 앞에 — 09:00 장 시작 전에 닿아야 의미가 있다.
         "cmds": [["notify", "morning"], ["morning"]]},
```

```python
         "cmds": [["ingest-minutes", "--top", "200"],
                  ["daily"],
                  # 저녁 알림은 daily 직후 — 공시·주간·블로그를 기다리지 않는다.
                  ["notify", "evening"],
                  ["ingest-disclosures", "--days", "3"],
                  ["weekly"],
                  ["blog"]]},
```

`run_job` — `if rc != 0:` 블록을 다음으로 바꾼다:

```python
            if rc != 0:
                # 배치 실패는 운영자에게 바로 — 뉴스가 3주 멈춘 걸 아무도 몰랐다(2026-10-09).
                try:
                    from engine.notify.telegram import send_ops
                    send_ops(f"배치 실패: {job['name']} :: {' '.join(cmd)} (exit={rc})")
                except Exception:  # noqa: BLE001
                    pass
                return False
```

`naver_news.py` — `log.error("naver.news.all_empty", ...)` 바로 아래에:

```python
        try:
            from engine.notify.telegram import send_ops
            send_ops(f"뉴스 수집 0건 — 대상 {len(id_by_symbol)}종목. 네이버 응답 변경 의심")
        except Exception:  # noqa: BLE001
            pass
```

- [ ] **Step 4: 통과 + 건조 실행**

Run: `cd apps/engine && .venv/Scripts/python.exe -m pytest tests -q`
Expected: 전부 PASS

Run: `cd apps/engine && .venv/Scripts/python.exe -m engine.cli notify evening --force`
Expected: 토큰이 아직 없으면 `telegram.no_token` 경고 + `{'sent': 0, ...}` — 예외 없이 끝나야 한다.

- [ ] **Step 5: Commit**

```bash
git add apps/engine/engine/cli.py apps/engine/engine/notify/telegram.py apps/engine/engine/ingest/naver_news.py apps/engine/tests/test_notify.py
git commit -m "feat(engine): notify 명령(저녁·아침)·23시 규칙·워커 연결·배치 실패/뉴스 0건 운영 알림"
```

---

### Task 8: 엔진 — `telegram-setup` 명령(웹훅 등록 + 비밀값 저장)

**Files:**
- Modify: `apps/engine/engine/cli.py`

- [ ] **Step 1: 구현** — `notify` 명령 아래에 추가

```python
@app.command("telegram-setup")
def telegram_setup(
    url: str = typer.Option("https://vecta.win/api/telegram/webhook", help="웹훅 주소"),
) -> None:
    """텔레그램 웹훅 등록 + 웹훅 비밀값을 DB(app_secrets)에 저장. 배포 후 한 번 실행.

    비밀값은 환경변수(TELEGRAM_WEBHOOK_SECRET)에서만 읽고 출력하지 않는다.
    같은 값을 Vercel 환경변수에도 넣어야 웹훅이 동작한다.
    """
    from engine.config import get_settings
    from engine.db import get_client
    from engine.notify.telegram import make_http

    st = get_settings()
    if not st.telegram_bot_token or not st.telegram_webhook_secret:
        typer.echo("TELEGRAM_BOT_TOKEN · TELEGRAM_WEBHOOK_SECRET 를 .env.local 에 넣으세요")
        raise typer.Exit(1)
    get_client().table("app_secrets").upsert(
        {"key": "telegram_webhook", "value": st.telegram_webhook_secret},
        on_conflict="key").execute()
    code = make_http(st.telegram_bot_token)("setWebhook", {
        "url": url, "secret_token": st.telegram_webhook_secret,
        "allowed_updates": ["message"], "drop_pending_updates": True})
    typer.echo(f"setWebhook → HTTP {code} (200 이면 완료)")
    if code != 200:
        raise typer.Exit(1)
```

- [ ] **Step 2: 문법 확인**

Run: `cd apps/engine && .venv/Scripts/python.exe -m engine.cli telegram-setup --help`
Expected: 도움말 출력(실행은 Task 13 에서).

- [ ] **Step 3: Commit**

```bash
git add apps/engine/engine/cli.py
git commit -m "feat(engine): telegram-setup — 웹훅 등록·비밀값 저장"
```

---

### Task 9: 웹 — 텔레그램 웹훅

**Files:**
- Create: `apps/web/app/api/telegram/webhook/route.ts`
- Modify: `apps/web/middleware.ts` (`PUBLIC_FILES`)
- Modify: `apps/web/.env.example`

- [ ] **Step 1: 웹훅 라우트 작성**

```ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 텔레그램 웹훅 — /start <코드> 로 회원과 채팅을 잇고, /끄기 로 끊는다(2026-10-09).
 *
 * 웹에는 service role 키가 없다. 그래서 DB 의 security definer 함수(telegram_link ·
 * telegram_unlink)가 «웹훅 비밀값»을 확인한 뒤에만 쓴다. 텔레그램은 등록 때 준
 * secret_token 을 매 요청 헤더에 실어 보낸다 — 그게 다르면 401.
 *
 * 답장은 응답 본문으로 한다(텔레그램 «webhook reply»). 봇 토큰을 웹에 둘 필요가 없다.
 */
export const dynamic = "force-dynamic";

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const ALERTS = "https://vecta.win/alerts";

function reply(chatId: number, text: string) {
  return NextResponse.json({ method: "sendMessage", chat_id: chatId, text });
}

export async function POST(req: NextRequest) {
  if (!SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return new NextResponse(null, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as
    | { message?: { chat?: { id?: number; type?: string }; text?: string } }
    | null;
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  if (!chatId || msg?.chat?.type !== "private") return NextResponse.json({ ok: true });
  const text = (msg?.text ?? "").trim();

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1] ?? "";
    if (!/^[0-9a-f]{32}$/.test(code)) {
      return reply(chatId, `VECTA 사이트의 「알림」 화면에서 [텔레그램 연결]을 눌러 시작해 주세요.\n${ALERTS}`);
    }
    const { data, error } = await sb.rpc("telegram_link", {
      p_secret: SECRET, p_code: code, p_chat_id: chatId,
    });
    if (error || data !== true) {
      return reply(chatId, `연결 코드가 만료됐거나 이미 사용됐습니다. 사이트에서 다시 눌러 주세요.\n${ALERTS}`);
    }
    return reply(chatId, "연결됐습니다. 매일 저녁 «내일 할 일»을 보내 드립니다.\n끄려면 /끄기 를 보내세요.");
  }
  if (text === "/끄기" || text === "/stop") {
    await sb.rpc("telegram_unlink", { p_secret: SECRET, p_chat_id: chatId });
    return reply(chatId, `알림을 껐습니다. 다시 켜려면 사이트에서 연결해 주세요.\n${ALERTS}`);
  }
  return reply(chatId, "VECTA 알림 봇입니다. 끄려면 /끄기 를 보내세요.");
}
```

- [ ] **Step 2: 미들웨어에서 공개** — `PUBLIC_FILES` 배열에 웹훅 경로를 추가하고 주석 한 줄:

```ts
// /api/telegram/webhook — 텔레그램 서버가 부른다. 로그인 쿠키가 있을 수 없고,
// 대신 secret_token 헤더로 스스로를 증명한다(route.ts).
const PUBLIC_FILES = ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/api/telegram/webhook"];
```

- [ ] **Step 3: 웹 .env.example** 끝에:

```
# 텔레그램 — 웹훅 비밀값(엔진 .env.local 과 같은 값) · 봇 아이디(t.me/<아이디>)
TELEGRAM_WEBHOOK_SECRET=
NEXT_PUBLIC_TELEGRAM_BOT=
```

- [ ] **Step 4: 빌드 확인**

Run: `cd apps/web && npm run build`
Expected: 성공, 라우트 목록에 `ƒ /api/telegram/webhook`.

- [ ] **Step 5: 로컬 401 확인** (dev 서버를 preview_start 로 띄운 뒤)

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/telegram/webhook -d "{}"`
Expected: `401` (로그인 리다이렉트 307 이 나오면 미들웨어 공개 설정이 빠진 것)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/telegram apps/web/middleware.ts apps/web/.env.example
git commit -m "feat(web): 텔레그램 웹훅 — /start 코드 연결·/끄기"
```

---

### Task 10: 웹 — 알림 화면에서 연결·해제

**Files:**
- Create: `apps/web/app/alerts/actions.ts`
- Modify: `apps/web/app/alerts/page.tsx` (「알림 채널」 섹션의 텔레그램 줄)

- [ ] **Step 1: 서버 액션**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * 텔레그램 연결·해제(2026-10-09). 권한 확인은 DB 가 한다 —
 * telegram_link_code() 는 로그인한 본인 코드만 만들고, telegram_links 의 update
 * 정책은 user_id = auth.uid() 다.
 */
export async function connectTelegram() {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("telegram_link_code");
  if (error || typeof data !== "string" || !bot) {
    redirect("/alerts?telegram=error");
  }
  redirect(`https://t.me/${bot}?start=${data}`);
}

export async function disconnectTelegram() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("telegram_links").update({ active: false }).eq("user_id", user.id);
  revalidatePath("/alerts");
}
```

- [ ] **Step 2: 연결 상태 읽기 + 줄 교체** — `page.tsx` 상단 import 에 추가:

```ts
import { createClient as createUserClient } from "@/lib/supabase/server";
import { connectTelegram, disconnectTelegram } from "./actions";
```

`AlertsPage` 맨 앞(`const feed = await buildFeed();` 위)에:

```ts
  const supabase = await createUserClient();
  const { data: link } = await supabase
    .from("telegram_links")
    .select("active")
    .maybeSingle();
  const connected = Boolean((link as { active?: boolean } | null)?.active);
  // 연결 기록은 있는데 꺼져 있다 = 봇 차단(403)이나 /끄기 — 다시 연결을 권한다.
  const dropped = Boolean(link) && !connected;
```

「알림 채널」 섹션의 텔레그램 `<div ...>` 블록(「연결 준비 중」 배지가 있는 것)을 다음으로 바꾼다:

```tsx
              <div className="flex items-center justify-between rounded-[12px] bg-surface-2 px-3.5 py-2.5">
                <span>
                  <span className="block text-[13px] font-semibold text-text">텔레그램</span>
                  <span className="block text-[11px] text-text-mute">
                    {dropped
                      ? "연결이 끊겼습니다 — 다시 연결하면 알림을 이어서 받습니다"
                      : "매일 저녁 «내일 할 일» 1통 · 매수 있는 날 아침 8:30 리마인더"}
                  </span>
                </span>
                {connected ? (
                  <form action={disconnectTelegram}>
                    <button
                      type="submit"
                      className="rounded-[999px] bg-surface-3 px-2.5 py-1 text-[11px] font-bold text-text-dim hover:text-text"
                    >
                      연결됨 · 해제
                    </button>
                  </form>
                ) : (
                  <form action={connectTelegram}>
                    <button
                      type="submit"
                      className="rounded-[999px] bg-accent px-3 py-1 text-[11px] font-bold text-text-on-accent"
                    >
                      {dropped ? "다시 연결" : "텔레그램 연결"}
                    </button>
                  </form>
                )}
              </div>
```

이벤트 설정 섹션 머리의 `발송: 08:30 모닝 · 16:30 일일 배치` 문구를 `발송: 저녁(일일 배치 직후) · 아침 08:30` 로 바꾼다.

- [ ] **Step 3: 빌드 + 화면 확인**

Run: `cd apps/web && npm run build` → 성공.
preview 로 `/alerts` 를 열고(회원 로그인 필요 — 메모리 `stock-alpha-verify-without-login` 방법 사용), 「텔레그램 연결」 버튼이 보이는지 확인한다.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/alerts
git commit -m "feat(web): 알림 화면 — 텔레그램 연결·해제"
```

---

### Task 11: 웹 — 내 주문표

**Files:**
- Create: `apps/web/lib/orders.ts`
- Create: `apps/web/app/orders/page.tsx`, `apps/web/app/orders/_amount.tsx`, `apps/web/app/orders/_copy.tsx`, `apps/web/app/orders/actions.ts`
- Modify: `apps/web/components/AssetTabs.tsx`

- [ ] **Step 1: 데이터·계산** — `lib/orders.ts`

```ts
import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * 내 주문표 — 엔진이 쓴 pick_actions 를 그대로 읽는다(2026-10-09).
 * 숫자를 여기서 «다시» 계산하지 않는다. 하는 일은 수량 환산 하나뿐이다:
 *   수량 = floor(투자 금액 × 권장 비중 ÷ 진입가) — 모든 회원 같은 공식(일반 로직).
 */
export type ActionKind = "buy" | "raise_stop" | "sell" | "closed";

export interface OrderAction {
  kind: ActionKind;
  symbol: string;
  name: string;
  forDate: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  price: number | null;
  prevPrice: number | null;
  weightPct: number | null;
  returnPct: number | null;
  status: string | null;
}

export interface OrderSheet {
  asOf: string | null;
  forDate: string | null;
  investAmount: number | null;
  actions: OrderAction[];
}

export function shares(amount: number | null, weightPct: number | null, entry: number | null) {
  if (!amount || !weightPct || !entry || entry <= 0) return null;
  const q = Math.floor((amount * weightPct) / 100 / entry);
  return q > 0 ? q : 0;
}

export async function getOrderSheet(): Promise<OrderSheet> {
  const supabase = await createUserClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  const { data: prof } = uid
    ? await supabase.from("profiles").select("invest_amount").eq("id", uid).maybeSingle()
    : { data: null };
  const investAmount =
    (prof as { invest_amount?: number | null } | null)?.invest_amount ?? null;

  const { data: latest } = await supabase
    .from("pick_actions")
    .select("as_of,for_date")
    .order("as_of", { ascending: false })
    .limit(1);
  const head = (latest ?? [])[0] as { as_of: string; for_date: string } | undefined;
  if (!head) return { asOf: null, forDate: null, investAmount, actions: [] };

  const { data } = await supabase
    .from("pick_actions")
    .select("kind,for_date,entry_price,stop_price,target_price,price,prev_price,weight_pct,return_pct,status,instruments(symbol,name)")
    .eq("as_of", head.as_of)
    .order("kind")
    .order("recommendation_id");
  const order: ActionKind[] = ["buy", "raise_stop", "sell", "closed"];
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const actions = ((data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const inst = (r.instruments ?? {}) as { symbol?: string; name?: string };
      return {
        kind: r.kind as ActionKind,
        symbol: inst.symbol ?? "",
        name: inst.name ?? "",
        forDate: String(r.for_date),
        entry: num(r.entry_price),
        stop: num(r.stop_price),
        target: num(r.target_price),
        price: num(r.price),
        prevPrice: num(r.prev_price),
        weightPct: num(r.weight_pct),
        returnPct: num(r.return_pct),
        status: (r.status as string | null) ?? null,
      };
    })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { asOf: head.as_of, forDate: head.for_date, investAmount, actions };
}
```

- [ ] **Step 2: 금액 저장 액션** — `app/orders/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/** 투자 금액 저장 — profiles 의 본인 update 정책(id = auth.uid())을 탄다. */
export async function saveInvestAmount(formData: FormData) {
  const raw = String(formData.get("amount") ?? "").replace(/[^0-9]/g, "");
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 100_000 || amount > 100_000_000_000) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ invest_amount: amount }).eq("id", user.id);
  revalidatePath("/orders");
}
```

- [ ] **Step 3: 금액 입력·복사 버튼(클라이언트)**

`app/orders/_amount.tsx`:

```tsx
"use client";

import { useState } from "react";

import { saveInvestAmount } from "./actions";

export function AmountForm({ initial }: { initial: number | null }) {
  const [v, setV] = useState(initial ? initial.toLocaleString("ko-KR") : "");
  const [err, setErr] = useState("");
  return (
    <form
      action={async (fd) => {
        const n = Number(String(fd.get("amount") ?? "").replace(/[^0-9]/g, ""));
        if (!n || n < 100_000) {
          setErr("10만 원 이상으로 입력하세요");
          return;
        }
        setErr("");
        await saveInvestAmount(fd);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <label htmlFor="amount" className="text-[13px] text-text-mute">투자 금액</label>
      <input
        id="amount"
        name="amount"
        inputMode="numeric"
        value={v}
        onChange={(e) => {
          const d = e.target.value.replace(/[^0-9]/g, "");
          setV(d ? Number(d).toLocaleString("ko-KR") : "");
          setErr("");
        }}
        placeholder="10,000,000"
        className="w-[150px] rounded-[10px] border border-border bg-surface-2 px-3 py-1.5 text-right text-sm tabular-nums"
      />
      <span className="text-[13px] text-text-mute">원</span>
      <button type="submit" className="rounded-[10px] bg-accent px-3 py-1.5 text-[13px] font-bold text-text-on-accent">
        저장
      </button>
      {err && <span className="w-full text-[12px] text-bad">{err}</span>}
    </form>
  );
}
```

`app/orders/_copy.tsx`:

```tsx
"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: number }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(String(Math.round(value)));
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded-[8px] border border-border px-2 py-0.5 text-[11px] font-semibold text-text-dim hover:text-text"
      aria-label={`${Math.round(value).toLocaleString("ko-KR")} 복사`}
    >
      {done ? "복사됨" : "복사"}
    </button>
  );
}
```

- [ ] **Step 4: 화면** — `app/orders/page.tsx`

```tsx
import { AppShell } from "@/components/AppShell";
import { AssetTabs } from "@/components/AssetTabs";
import { getOrderSheet, shares, type OrderAction } from "@/lib/orders";

import { AmountForm } from "./_amount";
import { CopyButton } from "./_copy";

/**
 * 내 주문표 — «VECTA 픽 기준으로 내일 무엇을 해야 하나»를 주문 그대로 보여 준다
 * (2026-10-09 설계서). 실제로 샀는지는 VECTA 가 모른다 → «픽 기준 할 일»로만 쓴다.
 * 768px 미만은 표 대신 카드(메모리 mobile-tablet-rules).
 */
const WD = "일월화수목금토";
const won = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("ko-KR"));
// 서버(Vercel)는 UTC 다 — 로컬 시각 메서드를 쓰면 KST 자정이 전날로 밀린다.
// 날짜 문자열의 정오(UTC)를 잡고 UTC 메서드로 읽어 시간대와 무관하게 만든다.
const utcNoon = (iso: string) => new Date(iso + "T12:00:00Z");
const day = (iso: string) => {
  const d = utcNoon(iso);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WD[d.getUTCDay()]})`;
};
const CLOSED: Record<string, string> = {
  stopped: "손절", trailed: "추격 청산", breakeven: "본전 청산", expired: "기한 청산", target: "목표",
};

interface Line {
  key: string;
  name: string;
  symbol: string;
  task: string;
  tone: string;
  qty: number | null;
  amount: number | null;
  price: string;
  copy: number | null;
}

function lines(a: OrderAction, amount: number | null, wd: string): Line[] {
  const q = shares(amount, a.weightPct, a.entry);
  const amt = q != null && a.entry ? q * a.entry : null;
  const base = { name: a.name, symbol: a.symbol, qty: q, amount: amt };
  if (a.kind === "buy")
    return [
      { ...base, key: a.symbol + "b", task: `${wd} 시가 매수`, tone: "bg-good-soft text-good", price: "시장가", copy: null },
      { ...base, key: a.symbol + "s", task: "손절 주문", tone: "bg-accent-soft text-accent", price: won(a.stop), copy: a.stop },
    ];
  if (a.kind === "raise_stop")
    return [{ ...base, key: a.symbol + "r", task: "손절 올리기", tone: "bg-warn-soft text-warn", price: `${won(a.prevPrice)} → ${won(a.price)}`, copy: a.price }];
  if (a.kind === "sell")
    return [{ ...base, key: a.symbol + "x", task: `${wd} 종가 매도`, tone: "bg-surface-3 text-text-dim", price: "종가 전량", copy: null }];
  return [];
}

export default async function OrdersPage() {
  const sheet = await getOrderSheet();
  const wd = sheet.forDate ? WD[utcNoon(sheet.forDate).getUTCDay()] : "";
  const todo = sheet.actions.flatMap((a) => lines(a, sheet.investAmount, wd));
  const closed = sheet.actions.filter((a) => a.kind === "closed");

  return (
    <AppShell title="내 자산" subtitle="VECTA 픽을 따라 할 때 내일 할 일 — 주문 그대로">
      <AssetTabs />
      <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] text-text-mute">VECTA 픽 기준 할 일</p>
            <h2 className="text-lg font-bold text-text">
              {sheet.forDate ? `${day(sheet.forDate)} 할 일 ${todo.length}건` : "아직 할 일 목록이 없습니다"}
            </h2>
          </div>
          <AmountForm initial={sheet.investAmount} />
        </div>
        <p className="mb-2 text-[11px] text-text-mute">
          수량 = 권장 비중 × 투자 금액 ÷ 진입가 · 모든 회원 같은 공식 · 진입가는 전일 종가 기준 예상치
        </p>

        {todo.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-mute">내일은 할 일이 없습니다.</p>
        ) : (
          <>
            {/* 768px 이상: 표 */}
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="text-left text-[12px] text-text-mute">
                  <th className="py-2 font-medium">종목</th>
                  <th className="font-medium">할 일</th>
                  <th className="text-right font-medium">수량 · 금액</th>
                  <th className="text-right font-medium">가격</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {todo.map((l) => (
                  <tr key={l.key} className="border-t border-border">
                    <td className="py-2.5">
                      <span className="font-semibold text-text">{l.name}</span>{" "}
                      <span className="text-[11px] text-text-mute">{l.symbol}</span>
                    </td>
                    <td><span className={`rounded-[8px] px-2 py-0.5 text-[12px] font-semibold ${l.tone}`}>{l.task}</span></td>
                    <td className="text-right tabular-nums">
                      {l.qty == null ? <span className="text-text-mute">금액 입력</span> : `${l.qty.toLocaleString("ko-KR")}주 · 약 ${won(l.amount)}원`}
                    </td>
                    <td className="text-right tabular-nums">{l.price}</td>
                    <td className="text-right">{l.copy != null && <CopyButton value={l.copy} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* 768px 미만: 카드 */}
            <ul className="space-y-2 md:hidden">
              {todo.map((l) => (
                <li key={l.key} className="rounded-[12px] bg-surface-2 px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text">{l.name}</span>
                    <span className={`rounded-[8px] px-2 py-0.5 text-[12px] font-semibold ${l.tone}`}>{l.task}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[13px] tabular-nums">
                    <span className="text-text-dim">
                      {l.qty == null ? "금액 입력" : `${l.qty.toLocaleString("ko-KR")}주 · 약 ${won(l.amount)}원`}
                    </span>
                    <span className="flex items-center gap-2">
                      {l.price}
                      {l.copy != null && <CopyButton value={l.copy} />}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {closed.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1 text-[12px] text-text-mute">오늘 끝난 거래</p>
            <ul className="space-y-1 text-sm">
              {closed.map((a) => (
                <li key={a.symbol + "c"} className="flex justify-between">
                  <span>{a.name}</span>
                  <span className={(a.returnPct ?? 0) >= 0 ? "text-good" : "text-bad"}>
                    {CLOSED[a.status ?? ""] ?? a.status} {((a.returnPct ?? 0) * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-[10px] text-text-mute">투자 판단의 책임은 본인에게 있습니다.</p>
      </section>
    </AppShell>
  );
}
```

(색 토큰 `bg-good-soft`·`bg-accent-soft`·`bg-warn-soft` 가 없으면 `grep -n "soft" apps/web/tailwind.config.ts` 로 실제 이름을 확인해 바꾼다 — 알림 화면이 이미 `bg-warn-soft text-warn` 을 쓰고 있다. 상승=적은 `good` 축이다: 메모리 `vecta-light-theme`.)

- [ ] **Step 5: 탭 추가** — `components/AssetTabs.tsx` 의 `TABS` 에 「보유·관심」 다음으로:

```ts
  { label: "주문표", href: "/orders", hint: "VECTA 픽 기준 내일 할 일 — 수량·손절 복사" },
```

- [ ] **Step 6: 빌드 + 화면 확인**

Run: `cd apps/web && npm run build` → 성공, `/orders` 가 목록에 있음.
preview(로그인 상태)로 `/orders` 확인: ① 금액 저장 후 수량·금액 표시 ② 복사 버튼 ③ `resize_window` mobile(375px)에서 카드·가로 넘침 0 ④ 비로그인 접근 시 `/login?next=%2Forders` 로 이동(미들웨어 기본 잠김).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/orders.ts apps/web/app/orders apps/web/components/AssetTabs.tsx
git commit -m "feat(web): 내 주문표 — 수량·금액·손절 복사, 모바일 카드"
```

---

### Task 11b: 웹 — 디자인 리뷰 반영 (2026-10-09, 시안 vecta-v4.pen A·B·E)

시안 확정 뒤 `plan-design-review` 에서 정한 것. Task 11 코드 위에 덧댄다. 엔진 쪽 문구(「·」 구분, 할 일 없는 날 진행 중 픽 수)는 엔진 브랜치에 이미 반영됐다(커밋 c8c888b·7869d95).

**Files:**
- Modify: `apps/web/lib/orders.ts`, `apps/web/app/orders/page.tsx`, `apps/web/app/orders/_amount.tsx`, `apps/web/app/orders/_copy.tsx`, `apps/web/app/alerts/page.tsx`

- [ ] **Step 1: 진행 중 픽 수 + 오래된 목록 판정** — `lib/orders.ts`

`OrderSheet` 에 두 필드를 더한다:

```ts
  /** 진행 중(open) 픽 수 — 할 일 없는 날 «그대로 두세요» 문구용 */
  openCount: number;
  /** 목록의 실행일(for_date)이 이미 지났다 = 오늘 배치가 아직 안 끝났다 */
  stale: boolean;
```

`getOrderSheet` 끝(return 직전)에:

```ts
  const { count: openCount } = await supabase
    .from("recommendations")
    .select("id", { count: "exact", head: true })
    .eq("basket_type", "daily_focus")
    .eq("status", "open");
  // KST 오늘 — 서버는 UTC 라 +9h 로 날짜를 만든다(메모리 moscow-timezone-trap 과 같은 함정).
  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const stale = head.for_date < todayKst;
```

그리고 두 return 을 `{ ..., openCount: openCount ?? 0, stale }` 로 바꾼다(목록이 없을 때는 `openCount: 0, stale: false`).

- [ ] **Step 2: 화면 규칙 6가지** — `app/orders/page.tsx`

1. **매도 칩은 파랑** — 국내 증권사 관례(매수=빨강, 매도=파랑). `sell` 의 tone 을 `"bg-bad-soft text-bad"` 로.
2. **모바일은 종목당 카드 1장** — `todo` 를 `symbol` 로 묶어(`Map<string, Line[]>`, 등장 순서 유지) 카드 하나에 줄을 쌓는다. 첫 줄 = 종목명 + 첫 할 일 칩, 이어지는 «손절 주문» 줄은 위 테두리(`border-t border-border pt-2`)와 작은 칩 「이어서 손절 주문」(`bg-accent-soft text-accent text-[11px]`). 제목 숫자는 «할 일 N건»이 아니라 «할 일 N종목»(`new Set(todo.map(l => l.symbol)).size`). 데스크톱 표는 그대로 줄 단위.
3. **첫 방문(금액 미입력) 안내 띠** — `sheet.investAmount == null` 이고 할 일이 있으면 표 위에:
   ```tsx
   <p className="mb-3 flex items-start gap-2 rounded-[10px] bg-accent-soft px-3 py-2.5 text-[12px] text-accent">
     투자 금액을 넣으면 종목마다 몇 주를 살지 계산해 드립니다. 한 번만 넣으면 기억합니다.
   </p>
   ```
   수량 칸은 「금액 입력 후 표시」(text-text-mute).
4. **오래된 목록 경고** — `sheet.stale` 이면 제목 아래에:
   ```tsx
   <p role="status" className="mb-3 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[12px] text-warn">
     지난 거래일({day(sheet.asOf!)}) 기준 목록입니다. 오늘 분석이 아직 끝나지 않았어요 — 끝나면 자동으로 바뀝니다.
   </p>
   ```
5. **할 일 없는 날** — 기존 한 줄 문구를 바꾼다:
   ```tsx
   <div className="flex flex-col items-center gap-1.5 py-8 text-center">
     <p className="text-sm font-semibold text-text">내일은 할 일이 없습니다</p>
     {sheet.openCount > 0 && (
       <p className="text-[12px] text-text-mute">진행 중인 픽 {sheet.openCount}건은 그대로 두세요</p>
     )}
     <a href="/focus" className="mt-1 text-[12px] font-semibold text-accent">진행 중인 픽 보기 →</a>
   </div>
   ```
   제목도 `할 일 없음` 으로(`${day(forDate)} 할 일 없음`).
6. **0주** — `l.qty === 0` 이면 수량 칸에 `0주 · 금액 부족`(`text-warn font-semibold`), 카드/행 아래에 `한 주 가격({won(entry)}원)이 권장 비중 금액보다 커서 살 수 없습니다.`(text-[11px] text-text-mute). 이 경우 [복사] 버튼은 숨긴다.

- [ ] **Step 3: 저장 결과 표시** — `_amount.tsx`

`const [saved, setSaved] = useState(false);` 를 두고, 저장 액션 성공 뒤 `setSaved(true); setTimeout(() => setSaved(false), 2000);`. 버튼 옆에 `{saved && <span role="status" className="text-[12px] text-pass">저장됨</span>}`. 입력을 고치면 `setSaved(false)`.

- [ ] **Step 4: 복사 버튼 — 손가락 크기·읽어 주기** — `_copy.tsx`

className 에 `min-h-[36px] md:min-h-0 px-3 md:px-2` 를 더하고(모바일 터치 영역), 버튼 안에 `<span className="sr-only" aria-live="polite">{done ? "복사했습니다" : ""}</span>` 를 둔다.

- [ ] **Step 5: 알림 화면 연결 실패 안내** — `app/alerts/page.tsx`

`export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ telegram?: string }> })` 로 받고, `const sp = await searchParams;` 후 텔레그램 줄 바로 아래에:

```tsx
{sp.telegram === "error" && (
  <p role="alert" className="px-1 text-[11px] text-fail">
    연결 코드를 만들지 못했습니다. 잠시 후 다시 눌러 주세요.
  </p>
)}
```

- [ ] **Step 6: 확인** — `npm run build` 성공. preview 로 `/orders` 를 375px·1440px 에서 열어 시안 A·B·E 와 나란히 비교(칩 색, 종목당 카드, 안내 띠, 0주 표시). `/alerts?telegram=error` 에서 안내 문구 확인.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/orders.ts apps/web/app/orders apps/web/app/alerts/page.tsx
git commit -m "feat(web): 주문표·알림 — 디자인 리뷰 반영(매도 파랑, 종목당 카드, 첫 방문·오래된 목록·0주·빈 날 상태)"
```

---

### Task 12: 웹 — 추격 손절 표시를 저장값으로

**Files:**
- Modify: `apps/web/lib/data.ts` (열린 픽 effStop 계산부, 약 2410~2425행)

- [ ] **Step 1: select 에 컬럼 추가** — 열린 픽을 읽는 쿼리를 찾는다:

Run: `grep -n "tp1_hit_at\|\"tp1_hit\|tp1_hit," apps/web/lib/data.ts`
그 `.select("...")` 문자열(픽 기록을 읽는 것, `confirmed_at` 과 `tp1_hit` 를 함께 고르는 것)에 `,trail_stop` 을 추가한다.

- [ ] **Step 2: 계산 교체** — 현재:

```ts
        let effStop = tp1Hit && entry != null ? entry : stop;
        if (tp1Hit && entry != null && stop != null) {
          const since = (r.confirmed_at as string | null) ?? (r.as_of as string);
          const peak = await getPeakHigh(r.instrument_id as number, since);
          if (peak != null) effStop = Math.max(entry, peak - (entry - stop));
        }
```

를 다음으로:

```ts
        // 엔진이 저장한 추격 손절(0051, 2026-10-09)이 단일 출처다. 저장 전 픽만
        // 예전 방식(고점 − 1R)으로 추정한다 — 이 분기는 배치가 한 번 돌면 사라진다.
        const stored = r.trail_stop as number | null;
        let effStop = tp1Hit && entry != null ? entry : stop;
        if (tp1Hit && stored != null) {
          effStop = Number(stored);
        } else if (tp1Hit && entry != null && stop != null) {
          const since = (r.confirmed_at as string | null) ?? (r.as_of as string);
          const peak = await getPeakHigh(r.instrument_id as number, since);
          if (peak != null) effStop = Math.max(entry, peak - (entry - stop));
        }
```

- [ ] **Step 3: 빌드 + 홈 확인**

Run: `cd apps/web && npm run build` → 성공. preview 로 홈 「진행 중」 표의 저스템(추격 중) 손절값이 `recommendations.trail_stop` 값과 같은지 확인(엔진 배치 1회 후).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/data.ts
git commit -m "fix(web): 추격 손절 표시를 엔진 저장값(trail_stop)으로 — 이중 계산 제거"
```

---

### Task 13: 배포 · 봇 생성 · 시범 운영 시작

이 Task 의 ①②는 **Victor 가 직접** 한다(계정·비밀키는 Claude 가 입력하지 않는다).

- [ ] **Step 1 (Victor): 봇 만들기** — 텔레그램에서 `@BotFather` → `/newbot` → 이름 `VECTA 알림`, 아이디 예: `vecta_alert_bot`. 받은 토큰을 `apps/engine/.env.local` 의 `TELEGRAM_BOT_TOKEN=` 에 붙여 넣는다.
- [ ] **Step 2 (Victor): 웹훅 비밀값** — 터미널에서 값을 만든다:

```bash
python -c "import secrets; print(secrets.token_hex(24))"
```

그 값을 `apps/engine/.env.local` 의 `TELEGRAM_WEBHOOK_SECRET=` 와 Vercel 프로젝트 환경변수 `TELEGRAM_WEBHOOK_SECRET` 에 넣고, Vercel 에 `NEXT_PUBLIC_TELEGRAM_BOT=<봇 아이디>` 도 추가한다.

- [ ] **Step 3: 머지·배포** — `feat/pick-follow-alerts` → master 머지·푸시(Vercel 자동 배포, 메모리 `commit-and-deploy-without-asking`).
- [ ] **Step 4: 웹훅 등록**

Run: `cd apps/engine && .venv/Scripts/python.exe -m engine.cli telegram-setup`
Expected: `setWebhook → HTTP 200`

- [ ] **Step 5: Victor 연결** — vecta.win/alerts → [텔레그램 연결] → 봇 [시작] → 「연결됐습니다」 수신. 사이트에 「연결됨 · 해제」 표시.
- [ ] **Step 6: 수동 발송 1회**

Run: `cd apps/engine && .venv/Scripts/python.exe -m engine.cli notify evening --force`
Expected: Victor 텔레그램에 저녁 메시지 1통, `[내 주문표 열기]` 버튼 → `/orders`. 같은 명령을 한 번 더 실행하면 `skipped: 1`(중복 없음).

- [ ] **Step 7: 시범 1주** — `TELEGRAM_AUDIENCE=admins` 유지. 매일 저녁 메시지 ↔ `/orders` ↔ 홈 진행 중 표의 숫자(진입·손절·추격 손절)를 대조해 불일치를 기록한다. 7일 동안 0건이면 `.env.local` 을 `TELEGRAM_AUDIENCE=members` 로 바꾼다.

---

### Task 14: 마무리 검증

- [ ] **Step 1:** `cd apps/engine && .venv/Scripts/python.exe -m pytest tests -q` → 전부 PASS
- [ ] **Step 2:** `cd apps/web && npm run build` → 성공
- [ ] **Step 3:** `/security-review` — 범위: 0051 RLS(telegram_links·pick_actions·app_secrets·outbox), security definer 함수 3개, 웹훅 비밀값 검증, 토큰이 웹·로그에 없는지
- [ ] **Step 4:** `/code-review` 후 리뷰 로그 한 줄(전역 CLAUDE.md 규칙)

---

## 디자인 리뷰 기록 (plan-design-review, 2026-10-09)

시안: `design/vecta-v4.pen` — A 주문표 데스크톱 · B 모바일 · C 알림 3상태 · D 텔레그램 메시지 · E 주문표 상태 4종(리뷰에서 추가).

| 관점 | 전 | 후 | 반영 |
|---|---|---|---|
| 정보 순서 | 7 | 9 | 모바일 종목당 카드, 제목 «N종목» |
| 상태별 화면 | 4 | 9 | 첫 방문·할 일 없는 날·오래된 목록·0주·저장됨·연결 실패 |
| 사용자 흐름 | 7 | 9 | 빈 날 «그대로 두세요» + 진행 중 픽 링크(불안 해소) |
| 뻔한 AI 디자인 | 8 | 9 | 카드는 모바일에서만(표가 안 들어가는 폭), 장식 없음 |
| 디자인 기준 | 6 | 8 | DESIGN.md 없음 → globals.css 토큰을 기준으로. 매도=파랑(국내 관례) |
| 모바일·접근성 | 6 | 9 | 복사 버튼 터치 36px, 복사·저장 결과 읽어 주기(aria-live), 알림 오류 role=alert |
| 미결정 | — | 0 | 남은 결정 없음 |

전체 6/10 → 9/10. 남은 1점: DESIGN.md(디자인 기준 문서)가 없다 — 범위 밖(별도 작업).

**범위 밖:** 화면 안 «샀음» 체크 · 장중 알림 · 카카오(정책상 보류, 메모리 kakao-channel-blocked) · DESIGN.md 작성.
**이미 있는 것 재사용:** 라이브 헤더·「내 자산」 탭(AssetTabs)·globals.css 색 토큰·알림 화면 카드 모양.

