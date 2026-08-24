-- 0043 회원가입 양식 — 닉네임 · 연락처.
--
-- 2026-08-24 Victor: "회원가입 폼에 최소한 닉네임 · 연락처 · 이메일 · 비밀번호는
-- 있어야 할 것 같다."
--
-- 닉네임은 **새 컬럼을 만들지 않는다.** profiles.display_name 이 이미 그것이다
-- (0005 에서 auth 트리거가 이메일 앞부분으로 채우고 있었다). 같은 것을 두 컬럼에
-- 담으면 어느 쪽이 화면에 나가는지가 곧 갈린다.
--
-- 연락처는 새로 받는다. 개인정보이므로:
--   · profiles 의 RLS 는 이미 «본인만»이다(0006). 남이 못 읽는다
--   · 절대 URL·로그·화면 어디에도 흘리지 않는다
--   · 무엇에 쓰는지 가입 화면에 적고 동의를 받는다(웹 쪽에서 처리)

alter table profiles add column if not exists phone text;

comment on column profiles.phone is
  '연락처 — 본인 확인·중요 공지용. RLS 로 본인만 읽는다. 화면·로그에 노출 금지.';
comment on column profiles.display_name is
  '닉네임 — 가입 시 사용자가 정한다. 이메일 앞부분을 자동으로 넣지 않는다.';

-- 가입 시 넘긴 값을 프로필로 옮긴다.
--
-- 왜 트리거인가: 이메일 확인을 켠 프로젝트에서는 가입 직후 **세션이 없다.** 그러면
-- 웹이 profiles 에 직접 쓸 수 없다(RLS 가 auth.uid() 를 못 본다). 가입 폼이 보낸 값을
-- auth.users.raw_user_meta_data 에 실어 두고, 이 트리거가 옮긴다.
--
-- 닉네임이 없으면 예전처럼 이메일 앞부분으로 되돌아간다 — 옛 계정과 외부 가입 경로가
-- 깨지지 않게. 다만 새 가입 폼은 닉네임을 필수로 받는다.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'nickname', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    ),
    nullif(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$;
