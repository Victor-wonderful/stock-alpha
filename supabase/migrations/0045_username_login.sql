-- 0045 아이디 로그인 — 이메일 대신 아이디로 들어온다.
--
-- 2026-08-24 Victor: "이메일이 아니라 아이디로 바꿔라." 이메일은 남긴다(비밀번호 찾기·
-- 중요 공지). 화면에서 신원을 말하는 값만 아이디로 바꾼다.
--
-- ## Supabase 인증은 이메일로 로그인한다
--
-- 그래서 둘 중 하나를 골라야 했다:
--   (가) 가짜 내부 이메일(`아이디@...`)을 만들어 그것으로 인증한다
--   (나) 진짜 이메일을 그대로 두고, **아이디로 이메일을 찾아** 로그인한다
--
-- (가)를 버린 이유: 이 프로젝트는 **가입 확인 메일이 켜져 있다**(8/24 가입 계정의
-- confirmation_sent_at 으로 확인). 받을 수 없는 주소로 확인 메일을 보내면 가입 자체가
-- 끝나지 않는다. 게다가 나중에 비밀번호 찾기를 붙일 때 표준 기능을 못 쓴다.
--
-- ## 찾는 함수가 이메일을 흘리지 않게
--
-- 단순히 «아이디 → 이메일»을 돌려주는 함수를 만들면 아이디만 알면 남의 이메일을 캐낼
-- 수 있다. 그래서 **비밀번호가 맞을 때만** 이메일을 돌려준다(pgcrypto 로 대조).
-- 틀리면 null 이라 아이디가 있는지조차 알려주지 않는다.

alter table profiles add column if not exists username text;

-- 소문자·숫자·밑줄·하이픈 4~20자. 주소와 화면에 그대로 나가는 값이라 좁게 받는다.
do $$ begin
  alter table profiles add constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9][a-z0-9_-]{3,19}$');
exception when duplicate_object then null; end $$;

create unique index if not exists profiles_username_uniq
  on profiles (username) where username is not null;

comment on column profiles.username is
  '로그인 아이디. 화면에 노출되는 값이라 소문자·숫자·밑줄·하이픈만 받는다. '
  '인증 자체는 여전히 auth.users.email 로 하고, 이 값은 그 이메일을 찾는 열쇠다.';

-- ── 기존 계정 채우기 ──
-- 아이디가 없으면 로그인 화면에서 들어올 길이 없다. 이메일 앞부분을 규격에 맞게 깎아
-- 넣는다. 사람이 정한 값이 아니므로, 프로필에서 바꿀 수 있어야 한다(별도 화면).
update profiles p
   set username = sub.candidate
  from (
    select u.id,
           left(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_-]', '', 'g'), 20)
             as candidate
      from auth.users u
  ) sub
 where p.id = sub.id
   and p.username is null
   and sub.candidate ~ '^[a-z0-9][a-z0-9_-]{3,19}$';

-- ── 가입 시 아이디 저장 ──
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, username, display_name, phone,
    terms_agreed_at, privacy_agreed_at, agreed_doc_version
  )
  values (
    new.id,
    nullif(meta->>'username', ''),
    coalesce(
      nullif(meta->>'nickname', ''),
      nullif(meta->>'name', ''),
      split_part(new.email, '@', 1)
    ),
    nullif(meta->>'phone', ''),
    case when meta->>'agreed_terms' = 'true' then now() end,
    case when meta->>'agreed_privacy' = 'true' then now() end,
    nullif(meta->>'doc_version', '')
  );
  return new;
end;
$$;

-- ── 아이디로 로그인할 이메일 찾기 ──
--
-- 비밀번호가 맞을 때만 이메일을 돌려준다. 그래서 이 함수로는 «그 아이디가 있는가»조차
-- 알 수 없다 — 있는 아이디에 틀린 비밀번호나, 없는 아이디나 결과가 똑같이 null 이다.
--
-- 실제 로그인(세션 발급)은 이 함수가 하지 않는다. 웹이 받은 이메일로 Supabase 인증을
-- 다시 부른다 — 세션·리프레시 토큰 발급은 인증 서버의 일이고, 여기서 흉내 내면 안 된다.
create or replace function login_email(p_username text, p_password text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select u.email
    from profiles p
    join auth.users u on u.id = p.id
   where p.username = lower(trim(p_username))
     and u.encrypted_password = crypt(p_password, u.encrypted_password)
   limit 1;
$$;

revoke all on function login_email(text, text) from public;
grant execute on function login_email(text, text) to anon, authenticated;

-- ── 아이디 중복 확인 ──
-- 가입 폼이 «이미 쓰는 아이디»를 말해 주려면 필요하다. 아이디는 어차피 화면에 노출되는
-- 공개 값이라 존재 여부가 새어도 잃을 것이 없다(이메일과 다르다).
create or replace function username_taken(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where username = lower(trim(p_username)));
$$;

revoke all on function username_taken(text) from public;
grant execute on function username_taken(text) to anon, authenticated;
