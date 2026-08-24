-- 0042 blog_posts — 엔진이 자동으로 발행하는 «글».
--
-- 2026-08-24 Victor: "매일 브리프, 주간 브리프, 최근 기업 분석 → 이것은 이렇게 하는
-- 것이 아니라 블로그 형태로 글을 올리도록 하자. 단 블로그 형태이지만 자동으로
-- 콘텐츠가 배포가 되는 시스템을 만들어야 한다."
--
-- ## 왜 파일이 아니라 표인가
--
-- vecta-blog 는 글을 `content/<카테고리>/<하위>/<slug>.mdx` 파일로 읽는다(빌드 시).
-- 엔진이 그 파일을 만들어 커밋·푸시하는 길도 있었지만 표를 골랐다:
--   · 배치 PC 에 블로그 저장소와 push 권한을 주지 않아도 된다(운영 표면을 넓히지 않는다)
--   · 빌드 없이 즉시 반영되고, 잘못 나간 글은 published=false 한 줄로 내린다
--   · **사람 글(파일)과 기계 글(표)이 물리적으로 갈린다.** 블로그 기획안 §0 의
--     «결론은 사람이 낸다»가 구조로 남는다 — 섞이지 않으니 원칙이 안 깨진다
--
-- 블로그는 이 표를 **읽기만** 한다(anon). 쓰기는 엔진(service_role)뿐이다.
--
-- ## reports 와 무엇이 다른가
--
-- reports 는 «계산 결과»다(payload 가 JSON 수치 덩어리). 이 표는 그 결과를 **사람이
-- 읽는 글**로 옮긴 것이다. 둘을 한 표에 담지 않는 이유는 수명이 다르기 때문이다 —
-- 리포트는 매 배치 재생성되지만 글은 한 번 나가면 그날의 기록으로 남는다.

create table if not exists blog_posts (
  id             bigserial primary key,
  -- URL 조각. 같은 (category, sub) 안에서 유일하다.
  slug           text not null,
  category       text not null,          -- engine
  sub            text not null,          -- daily | weekly | analysis
  title          text not null,
  summary        text not null,
  -- 본문 마크다운. 블로그가 런타임에 그린다(MdxContent 가 문자열을 받는다).
  body_md        text not null,
  published_at   date not null,
  reading_minutes int not null default 3,
  -- 발행자. 화면에 반드시 표시한다 — 사람 글과 같은 목록에 섰을 때 누가 썼는지
  -- 모르면 블로그 전체의 «사람이 쓴다»는 약속이 흐려진다.
  author_kind    text not null default 'engine',
  -- 어느 계산분에서 나온 글인가. 규칙을 바꾸면 올려서 재발행을 강제한다.
  source_version text,
  -- 근거 추적 — 이 글이 인용한 reports.id 등. 환각 차단 규칙과 같은 장치.
  source_refs    jsonb not null default '{}'::jsonb,
  published      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 같은 날 같은 종류의 글은 하나다. 배치를 여러 번 돌려도 덮어쓰기가 된다.
create unique index if not exists blog_posts_slug_uniq
  on blog_posts (category, sub, slug);
create index if not exists blog_posts_published_idx
  on blog_posts (published_at desc);

drop trigger if exists trg_blog_posts_updated on blog_posts;
create trigger trg_blog_posts_updated before update on blog_posts
  for each row execute function set_updated_at();

-- 읽기는 공개(발행된 것만), 쓰기는 service_role 만 — 정책을 만들지 않으면 anon 은 못 쓴다.
alter table blog_posts enable row level security;
drop policy if exists blog_posts_read on blog_posts;
create policy blog_posts_read on blog_posts for select using (published);
