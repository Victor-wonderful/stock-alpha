-- 0049 회원 목록과 관리 숫자 — 운영자만.
--
-- 2026-08-25 Victor: "관리 페이지에 가입한 회원들 리스트들도 보일 수 있게 그리고
-- 가입회원 수 등을 보일 수 있는 것을 만들 수 있나?"
--
-- ## 왜 화면만으로는 안 되나
--
-- profiles 의 정책은 `id = auth.uid()` 하나다 — **운영자도 남의 닉네임 하나 못 읽는다.**
-- 게다가 이메일은 profiles 가 아니라 auth.users 에 있고, 그 스키마는 클라이언트에
-- 열려 있지 않다.
--
-- 정책을 넓히지 않는다. `is_admin() or id = auth.uid()` 로 고치면 profiles 전체가
-- «정책 한 줄»에 걸리게 되는데, 그 한 줄을 잘못 만지는 날 로그인한 아무나 전 회원을
-- 읽는다. 대신 **운영자인지 확인한 뒤에만 답하는 함수**를 둔다 — 전문가 승인
-- (0047 approve_expert_application)과 같은 방식이다.
--
-- ## 이메일을 왜 함께 돌려주나
--
-- 운영자가 회원에게 연락할 유일한 수단이고, 로그인 아이디이기도 하다(0046). 다만
-- 화면은 목록에 상시로 늘어놓지 않는다 — 행을 펼쳐야 보인다. 개인정보를 한 화면에
-- 늘어놓으면 캡처 한 장으로 전부 샌다.

-- ── 회원 목록 ──
create or replace function admin_members(
  p_q     text default null,
  p_limit int  default 200,
  p_offset int default 0
)
returns table (
  id               uuid,
  display_name     text,
  email            text,
  phone            text,
  tier             text,
  is_admin         boolean,
  email_confirmed  boolean,
  expert_name      text,
  terms_agreed_at  timestamptz,
  agreed_doc_version text,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception '권한이 없습니다';
  end if;

  return query
    select p.id,
           p.display_name,
           u.email::text,
           p.phone,
           p.tier::text,
           p.is_admin,
           (u.email_confirmed_at is not null) as email_confirmed,
           e.name as expert_name,
           p.terms_agreed_at,
           p.agreed_doc_version,
           p.created_at
      from profiles p
      join auth.users u on u.id = p.id
      left join experts e on e.user_id = p.id
     where p_q is null
        or p_q = ''
        or p.display_name ilike '%' || p_q || '%'
        or u.email ilike '%' || p_q || '%'
        or p.phone like '%' || p_q || '%'
     order by p.created_at desc
     limit greatest(p_limit, 1)
    offset greatest(p_offset, 0);
end;
$$;

revoke all on function admin_members(text, int, int) from public;
grant execute on function admin_members(text, int, int) to authenticated;

-- ── 관리 숫자 ──
-- 화면이 세는 것과 DB 가 세는 것이 갈리지 않게 한곳에서 낸다. 날짜 경계는 **KST**다 —
-- 서버가 UTC 로 세면 한국 시간 아침 9시 이전 가입이 «어제»로 잡힌다.
create or replace function admin_stats()
returns table (
  members        bigint,
  members_today  bigint,
  members_7d     bigint,
  unconfirmed    bigint,
  experts        bigint,
  pending_apps   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception '권한이 없습니다';
  end if;

  return query
    select (select count(*) from profiles),
           (select count(*) from profiles
             where (created_at at time zone 'Asia/Seoul')::date
                 = (now() at time zone 'Asia/Seoul')::date),
           (select count(*) from profiles where created_at >= now() - interval '7 days'),
           (select count(*) from auth.users where email_confirmed_at is null),
           (select count(*) from experts where active),
           (select count(*) from expert_applications where status = 'pending');
end;
$$;

revoke all on function admin_stats() from public;
grant execute on function admin_stats() to authenticated;
