-- 0046 아이디를 없애고 이메일로 로그인한다 — 0045 를 되돌린다.
--
-- 2026-08-24 Victor: "회원가입에 ID랑 이메일이 동일하면 되잖아. 왜 따로따로 해놓았지?"
--
-- 맞는 지적이다. 0045 에서 아이디 로그인을 붙이면서도 **이메일을 뺄 수는 없었다** —
-- Supabase 인증이 이메일 기준이고, 가입 확인 메일이 켜져 있어 진짜 받을 수 있는
-- 주소여야 가입이 끝나며, 비밀번호 찾기도 이메일이 필요하다. 그래서 신원값이 둘이
-- 됐고, 가입자는 «아이디»를 하나 더 지어내고 그것을 따로 기억해야 했다.
--
-- 신원값은 하나여야 한다. 가입 확인·비밀번호 찾기가 전부 이메일 기준이므로 남는 쪽은
-- 이메일이다.
--
-- ## 화면에 이메일이 노출되지 않는가
--
-- 되지 않는다. 화면에 보이는 이름은 **닉네임**(display_name)이고 가입 때 필수로 받는다.
-- 전문가 코너는 그 위에 필명을 따로 쓴다. 이메일은 로그인 칸에서만 쓰인다 —
-- 머리의 계정 자리도 이메일을 띄우지 않는다(components/AuthMenu).
--
-- ## 왜 컬럼을 남기지 않고 지우는가
--
-- 이 컬럼은 오늘 만들어졌고 값이 있는 계정은 둘뿐인데, 그 둘조차 사람이 정한 값이
-- 아니라 이메일 앞부분에서 자동 생성한 것이다(0045). 쓰지 않는 컬럼을 남기면 다음
-- 사람이 «로그인에 쓰이나» 하고 다시 들여다보게 된다.

-- ── 아이디로 이메일을 찾던 함수 ──
-- 이제 웹이 이메일을 직접 받으므로 이 우회로가 필요 없다. 남겨 두면 «비밀번호가 맞으면
-- 이메일을 돌려주는» 함수가 목적 없이 공개된 채로 남는다.
drop function if exists login_email(text, text);
drop function if exists username_taken(text);

-- ── 가입 시 아이디 저장을 되돌린다 ──
-- 나머지(닉네임·연락처·약관 동의 시각)는 0043·0044 그대로다.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, display_name, phone,
    terms_agreed_at, privacy_agreed_at, agreed_doc_version
  )
  values (
    new.id,
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

-- ── 컬럼 정리 ──
-- 제약·인덱스는 컬럼과 함께 사라진다.
alter table profiles drop column if exists username;
