-- 0040 전문가 추천 — 사람이 고른 종목. 엔진이 건드리지 않는 순수 콘텐츠다.
--
-- 2026-08-23 Victor 결정. 「오늘의 픽」(엔진)과 성격이 다르다:
--   오늘의 픽    기계가 게이트를 통과시킨 **실행 계획**. 진입가·손절가·기간이 붙고
--                엔진이 매일 상태를 갱신한다(recommendations).
--   전문가 추천  사람의 **의견**. 추적하지 않는다 — status·exit_price·수익률 컬럼이
--                여기 없는 것이 설계다. 배치도 이 표를 읽지 않는다.
--
-- 두 개를 같은 표에 담지 않는 이유: 컬럼이 같아지는 순간 화면과 집계가 둘을 섞기
-- 시작한다. 실제로 recommendations 는 basket_type 하나로 실전·재현을 갈랐다가
-- 성과 계산에서 계속 문제가 됐다([[resim-not-into-live-basket]]).

create table if not exists experts (
  id           bigserial primary key,
  handle       text not null unique,          -- URL·언급용 짧은 식별자
  name         text not null,                 -- 화면에 보이는 이름
  headline     text,                          -- 한 줄 소개 ("방산·조선 15년")
  bio          text,                          -- 긴 소개 (선택)
  avatar_url   text,
  active       boolean not null default true, -- false 면 목록에서 감춘다(글은 남는다)
  sort_order   int not null default 100,      -- 목록 정렬 — 낮을수록 위
  created_at   timestamptz not null default now()
);

create table if not exists expert_notes (
  id            bigserial primary key,
  expert_id     bigint not null references experts(id) on delete cascade,
  instrument_id bigint references instruments(id) on delete set null,
  as_of         date not null,                -- 추천한 날
  stance        text not null default 'watch',-- buy | watch — «산다»와 «본다»만 가른다
  summary       text not null,                -- 한 줄 요약 (목록에 보이는 문장)
  body          text,                         -- 본문 (상세에서 보인다)
  tags          text[] not null default '{}', -- 섹터·테마
  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 같은 사람이 같은 종목을 같은 날 두 번 올리지 않는다.
create unique index if not exists expert_notes_uniq
  on expert_notes (expert_id, instrument_id, as_of);
create index if not exists expert_notes_as_of_idx
  on expert_notes (as_of desc);

-- 읽기는 공개(익명 키), 쓰기는 서비스 롤만. 사용자 소유 데이터가 아니라 편집 콘텐츠다.
alter table experts enable row level security;
alter table expert_notes enable row level security;

drop policy if exists experts_read on experts;
create policy experts_read on experts for select using (true);

drop policy if exists expert_notes_read on expert_notes;
create policy expert_notes_read on expert_notes for select using (published);
