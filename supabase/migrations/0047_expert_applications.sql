-- 0047 전문가 참여 신청과 승인.
--
-- 2026-08-24 Victor: "전문가 참여를 승인해줘야 하는데?".
--
-- 지금까지 전문가를 만드는 길은 **운영자 PC 의 명령어 하나**뿐이었다
-- (scripts/setup_expert_corner.py). 그래서 «전문가를 하고 싶다»는 사람이 사이트에서
-- 말할 곳이 없었고, 운영자는 그 말을 다른 경로로 듣고 PC 앞에 앉아야 했다.
--
-- 여기서 두 가지를 만든다:
--   ① 신청서(expert_applications) — 회원이 스스로 낸다
--   ② 승인 — 운영자가 화면에서 누른다. 누르는 순간 experts 행이 생기고 계정이 연결된다
--
-- ## 왜 experts 에 바로 쓰지 않고 신청 표를 따로 두는가
--
-- experts 는 «화면에 보이는 사람»이다. 신청은 대부분 승인되지 않을 수도 있는 요청이고,
-- 거절 기록도 남겨야 한다(같은 사람이 다시 신청했을 때 판단 근거가 된다). 둘을 한
-- 표에 섞으면 «목록에 뜨면 안 되는 행»을 active 플래그로 가리게 되고, 그건 언젠가
-- 실수로 노출된다.

-- ── 운영자 표시 ──
-- 지금까지 «운영자»라는 개념이 코드에 없었다. 승인 화면을 만들려면 누가 누를 수 있는지
-- 부터 정해야 한다. 역할을 여러 개 만들 이유가 아직 없으므로 참/거짓 하나로 둔다.
alter table profiles add column if not exists is_admin boolean not null default false;

comment on column profiles.is_admin is
  '운영자 여부. 전문가 신청 승인 등 관리 화면의 출입 조건. '
  '역할이 더 필요해지면 그때 role 로 넓힌다 — 지금은 참/거짓 하나면 된다.';

-- 이미 등록된 전문가 중 «계정이 연결된 첫 사람»을 운영자로 올린다. 지금 그 사람은
-- Victor 한 명이고(experts #1 @vecta-research), 운영자가 하나도 없으면 승인 화면에
-- 아무도 못 들어가 신청서가 쌓이기만 한다.
update profiles p set is_admin = true
 where p.id in (select e.user_id from experts e where e.user_id is not null)
   and not exists (select 1 from profiles where is_admin);

-- 본인이 운영자인가 — 아래 정책들이 전부 이 한 조건을 쓴다.
-- security definer 인 이유: 정책 안에서 profiles 를 다시 읽으면 그 표의 정책이 또
-- 걸려 재귀한다.
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin);
$$;

-- ── 신청서 ──
create table if not exists expert_applications (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- 신청자가 «이렇게 쓰고 싶다»고 제안하는 값. 승인 때 그대로 experts 로 옮긴다.
  handle      text not null,
  name        text not null,
  headline    text,
  bio         text,
  -- 왜 참여하려는지. 승인 판단의 실제 근거라 필수다.
  reason      text not null,
  status      text not null default 'pending',   -- pending | approved | rejected
  review_note text,                              -- 거절 사유 — 신청자에게 보인다
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table expert_applications add constraint expert_applications_status
    check (status in ('pending', 'approved', 'rejected'));
exception when duplicate_object then null; end $$;

do $$ begin
  -- 주소에 들어가는 값이라 좁게 받는다(experts.handle 과 같은 규격).
  alter table expert_applications add constraint expert_applications_handle_format
    check (handle ~ '^[a-z0-9][a-z0-9-]{1,19}$');
exception when duplicate_object then null; end $$;

-- 한 사람이 동시에 두 건을 걸어 두지 못하게. 거절당한 뒤 다시 내는 것은 허용한다 —
-- 그래서 «대기 중»일 때만 막는다.
create unique index if not exists expert_applications_one_open
  on expert_applications (user_id) where status = 'pending';

create index if not exists expert_applications_status_idx
  on expert_applications (status, created_at desc);

alter table expert_applications enable row level security;

-- 신청자는 자기 것만 본다. 남의 신청서에는 이름·소개·사유가 들어 있다.
drop policy if exists expert_applications_read_own on expert_applications;
create policy expert_applications_read_own on expert_applications for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- 낼 수 있는 건 자기 이름으로만.
drop policy if exists expert_applications_insert_own on expert_applications;
create policy expert_applications_insert_own on expert_applications for insert to authenticated
  with check (user_id = auth.uid());

-- 판정은 운영자만. 신청자는 낸 뒤 고칠 수 없다 — 고칠 수 있으면 승인 직전에 내용이
-- 바뀔 수 있고, 그러면 운영자가 본 것과 승인된 것이 달라진다.
drop policy if exists expert_applications_review on expert_applications;
create policy expert_applications_review on expert_applications for update to authenticated
  using (is_admin()) with check (is_admin());

-- ── 승인 ──
--
-- 승인은 두 가지 일을 **한꺼번에** 해야 한다: 신청서 상태를 바꾸고, experts 에 행을
-- 만들고 계정을 연결하는 것. 웹에서 쿼리 두 번으로 나누면 사이에서 실패했을 때
-- «승인됐다고 적혀 있는데 전문가는 없는» 상태가 남는다. 그래서 함수 하나로 묶는다.
--
-- experts 는 운영자만 쓸 수 있어야 하는데 신청자에게 write 권한을 줄 수는 없으므로
-- security definer 로 두고, 함수 첫 줄에서 운영자인지 직접 본다.
create or replace function approve_expert_application(p_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  app expert_applications%rowtype;
  new_id bigint;
begin
  if not is_admin() then
    raise exception '권한이 없습니다';
  end if;

  select * into app from expert_applications where id = p_id and status = 'pending';
  if not found then
    raise exception '이미 처리된 신청이거나 없는 신청입니다';
  end if;

  -- 이미 전문가인 사람이 또 신청한 경우 — 새로 만들지 않고 기존 행을 살린다.
  select e.id into new_id from experts e where e.user_id = app.user_id;

  -- 공개 아이디가 겹치면 여기서 멈춘다. 그냥 두면 아래 insert 가 유니크 위반으로
  -- 죽는데, 그 오류 문구로는 운영자가 «무엇을 고쳐야 하는지» 알 수 없다.
  if exists (
    select 1 from experts e
     where e.handle = app.handle
       and (new_id is null or e.id <> new_id)
  ) then
    raise exception '공개 아이디 % 는 이미 쓰이고 있습니다. 신청자에게 다른 값을 받아 주세요.', app.handle;
  end if;

  if new_id is null then
    insert into experts (handle, name, headline, bio, user_id, active)
    values (app.handle, app.name, app.headline, app.bio, app.user_id, true)
    returning id into new_id;
  else
    update experts set active = true where id = new_id;
  end if;

  update expert_applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;

  return new_id;
end;
$$;

revoke all on function approve_expert_application(bigint) from public;
grant execute on function approve_expert_application(bigint) to authenticated;
