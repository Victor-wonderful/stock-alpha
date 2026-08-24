-- 0041 전문가 작성 권한 — 로그인한 전문가가 «자기 글만» 쓴다.
--
-- 0040 은 «쓰기는 서비스 롤만»이었다. 편집 콘텐츠라 그게 기본값으로 옳지만, 그러면
-- 글을 넣는 길이 Supabase 콘솔밖에 없다. 실제로 그래서 표를 만들어 두고도 한 편도
-- 쓰이지 않았다(2026-08-24 확인: 표 자체가 운영 DB 에 없었고 화면은 «아직 추천이
-- 없습니다»라고 말하고 있었다).
--
-- 그래서 작성자에게만 문을 연다. 서비스 롤을 웹에 두지 않는 것이 핵심이다 —
-- 폼은 사용자의 로그인 세션으로 쓰고, «누가 무엇을 쓸 수 있는가»는 여기 RLS 가
-- 정한다. 웹 코드가 실수해도 남의 이름으로는 못 쓴다.

-- ── 전문가 ↔ 로그인 계정 연결 ──
-- experts 는 «화면에 보이는 사람»이고 auth.users 는 «로그인하는 계정»이다. 1:1 이지만
-- 계정 없이 등록만 해 둔 전문가(외부 기고자)도 있을 수 있어 null 을 허용한다.
alter table experts add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists experts_user_uniq on experts (user_id) where user_id is not null;

-- 본인이 그 전문가인가 — 아래 정책들이 전부 이 한 조건을 쓴다.
create or replace function is_expert_owner(eid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from experts e where e.id = eid and e.user_id = auth.uid());
$$;

-- ── 읽기 ──
-- 0040 의 공개 읽기(published)는 그대로 두고, 작성자에게 «자기 초안»을 더 열어준다.
-- 초안을 못 보면 published=false 로 저장하는 순간 글이 사라진 것처럼 보인다.
drop policy if exists expert_notes_read_own on expert_notes;
create policy expert_notes_read_own on expert_notes for select to authenticated
  using (is_expert_owner(expert_id));

-- ── 쓰기 — 자기 글만 ──
drop policy if exists expert_notes_insert_own on expert_notes;
create policy expert_notes_insert_own on expert_notes for insert to authenticated
  with check (is_expert_owner(expert_id));

drop policy if exists expert_notes_update_own on expert_notes;
create policy expert_notes_update_own on expert_notes for update to authenticated
  using (is_expert_owner(expert_id))
  with check (is_expert_owner(expert_id));

-- 지우기는 열지 않는다. 발행한 추천을 소리 없이 없애면 성적이 좋은 글만 남는다
-- (이 코너는 추적하지 않지만, 지운 흔적이 없는 것과 처음부터 없던 것은 다르다).
-- 내리고 싶으면 published=false 로 내린다 — 그건 update 라 위 정책으로 된다.

-- ── 자기 소개 고치기 ──
drop policy if exists experts_update_own on experts;
create policy experts_update_own on experts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- updated_at 자동 갱신 — 0040 은 컬럼만 두고 트리거를 안 걸었다.
drop trigger if exists trg_expert_notes_updated on expert_notes;
create trigger trg_expert_notes_updated before update on expert_notes
  for each row execute function set_updated_at();

-- ── 가격 레벨 — «얼마에 사서 어디서 접나» ──
-- 2026-08-24 Victor: "전문가 추천 픽인데 얼마에 진입하고 목표가는 얼마, 손절가는
-- 얼마 이런 부분도 있어야 하는 거 아닌가?" 맞는 지적이다. 8/23 에는 «의견이니 레벨이
-- 없다»로 갔는데, 레벨 없는 추천은 읽는 사람이 실행할 수 없고 — 더 나쁘게는 —
-- 손절 없이 사게 만든다. 그게 이 제품이 가장 피하려는 결과다.
--
-- 그래서 «산다(buy)»에는 진입가·손절가를 **필수**로 건다. DB 가 막으면 화면이
-- 실수해도 손절 없는 추천은 못 들어온다. 목표가는 선택이다 — 엔진 픽에서 목표
-- 도달이 30건 중 0건이었던 것처럼, 목표는 파는 트리거로 잘 작동하지 않는다.
alter table expert_notes
  add column if not exists entry_price  numeric(18,4),
  add column if not exists target_price numeric(18,4),
  add column if not exists stop_loss    numeric(18,4),
  -- 며칠 | 몇 주 | 몇 달 — 엔진의 단기·중기·장기(5·10·20일)와 **다른 축**이다.
  -- 같은 이름을 쓰면 화면과 집계가 둘을 섞는다.
  add column if not exists horizon_note text;

do $$ begin
  alter table expert_notes add constraint expert_notes_buy_needs_levels check (
    stance <> 'buy' or (entry_price is not null and stop_loss is not null)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table expert_notes add constraint expert_notes_levels_sane check (
    (entry_price is null or entry_price > 0)
    and (stop_loss is null or entry_price is null or stop_loss < entry_price)
    and (target_price is null or entry_price is null or target_price > entry_price)
  );
exception when duplicate_object then null; end $$;
