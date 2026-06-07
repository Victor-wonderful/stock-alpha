-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0005 — 사용자 · 구독 · 워치리스트 · (Phase 3) 봇                ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── 프로필 (auth.users 1:1) ──
create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  tier               sub_tier not null default 'free',
  default_style      trade_style not null default 'swing',
  risk_per_trade_pct numeric(6,4) not null default 1.0,   -- 트레이드당 감수 리스크(%)
  display_name       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- auth.users 생성 시 profiles 자동 생성
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── 구독 ──
create table subscriptions (
  user_id            uuid not null references auth.users(id) on delete cascade,
  tier               sub_tier not null,
  status             text not null,                  -- active/canceled/past_due
  provider           text,                           -- 'stripe'/'toss'
  provider_sub_id    text,
  current_period_end timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id)
);
create trigger trg_subs_updated before update on subscriptions
  for each row execute function set_updated_at();

-- ── 워치리스트 ──
create table watchlists (
  user_id       uuid not null references auth.users(id) on delete cascade,
  instrument_id bigint not null references instruments(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, instrument_id)
);

-- ── 알림 ──
create table alerts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  signal_id  bigint references signals(id) on delete cascade,
  channel    text not null,                          -- 'webpush'/'email'
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on alerts (user_id, created_at desc);

-- ── 리포트 구독 (정기 발행 수신) ──
create table report_subscriptions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  report_type report_kind not null,
  frequency   text not null,                         -- 'daily'/'weekly'
  primary key (user_id, report_type)
);

-- ╔═══════════════ Phase 3 — 봇 (골격) ═══════════════╗

create table broker_credentials (
  user_id    uuid not null references auth.users(id) on delete cascade,
  broker     text not null,                          -- 'kis'
  enc_key    text not null,                          -- KMS 암호화 (출금권한 없는 키)
  enc_secret text not null,
  scopes     text[],
  created_at timestamptz not null default now(),
  primary key (user_id, broker)
);

create table bot_configs (
  user_id       uuid not null references auth.users(id) on delete cascade,
  instrument_id bigint not null references instruments(id) on delete cascade,
  enabled       boolean not null default false,
  style         trade_style not null default 'swing',
  max_position  numeric(20,2),
  risk_limit    numeric(10,4),
  kill_switch   boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, instrument_id)
);
create trigger trg_botcfg_updated before update on bot_configs
  for each row execute function set_updated_at();

create table executions (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  signal_id      bigint references signals(id) on delete set null,
  broker_order_id text,
  side           text not null,
  qty            numeric(20,2) not null,
  price          numeric(20,4),
  status         text not null,                       -- submitted/filled/canceled/rejected
  ts             timestamptz not null default now()
);
create index on executions (user_id, ts desc);

create table positions (
  user_id       uuid not null references auth.users(id) on delete cascade,
  instrument_id bigint not null references instruments(id) on delete cascade,
  qty           numeric(20,2) not null default 0,
  avg_price     numeric(20,4),
  updated_at    timestamptz not null default now(),
  primary key (user_id, instrument_id)
);
create trigger trg_positions_updated before update on positions
  for each row execute function set_updated_at();
