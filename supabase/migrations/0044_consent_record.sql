-- 0044 동의 기록 — «언제, 어느 판에» 동의했는지 남긴다.
--
-- 2026-08-24 Victor: "개인정보 수집 이용에 동의한다고 하면 이용약관이나 이런 것들이
-- 있어야 하는 거 아닌가?" — 문서를 만들면서 같이 넣는다. 동의는 받는 순간보다
-- **나중에 증명할 수 있는가**가 중요하다.
--
-- 체크박스만 두고 기록을 안 남기면, 분쟁이 생겼을 때 «그 사람이 무엇에 동의했는지»를
-- 아무도 말할 수 없다. 문서는 고쳐지기 때문이다. 그래서 시각과 **문서 판(version)**을
-- 함께 저장한다(lib/legal.LEGAL_VERSION).

alter table profiles
  add column if not exists terms_agreed_at    timestamptz,
  add column if not exists privacy_agreed_at  timestamptz,
  add column if not exists agreed_doc_version text;

comment on column profiles.agreed_doc_version is
  '동의한 약관·방침의 판(예: 2026-08-24). 문서를 고치면 판을 올린다 — 판을 안 올리면 '
  '나중에 어느 문장에 동의했는지 알 수 없다.';

-- 가입 시 넘어온 동의 표시를 프로필로 옮긴다(0043 과 같은 이유 — 이메일 확인을 켜면
-- 가입 직후 세션이 없어 웹이 직접 못 쓴다).
--
-- 시각은 **DB 의 now()** 를 쓴다. 클라이언트가 보낸 시각을 믿으면 증빙이 되지 않는다.
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
