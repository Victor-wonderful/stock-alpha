-- 뉴스 중복 적재 방지 키.
--
-- news 테이블은 0003 에서 스키마만 만들어두고 수집기가 없어 0건이었다. 이제 네이버
-- 금융 종목뉴스를 매일 수집하는데, 유니크 제약이 없으면 같은 기사가 매 실행마다
-- 새 행으로 쌓인다(하루 100종목 × 16건 × 매일).
--
-- 네이버는 기사마다 (office_id, article_id) 를 준다. 언론사-기사 조합이라 전역
-- 고유하고, URL 과 달리 파라미터(page, sm 등)가 붙어도 변하지 않는다.
-- 한 기사가 여러 종목에 걸릴 수 있으므로 instrument_id 까지 묶어 유니크로 둔다
-- (같은 기사를 두 종목에서 각각 보고 싶다).
alter table news add column if not exists provider text not null default 'naver';
alter table news add column if not exists provider_article_id text;

-- 기존 행이 없으므로(0건) not null 승격 대신 부분 유니크로 간다 —
-- 다른 경로로 들어온 뉴스(provider_article_id 미상)를 막지 않기 위함.
create unique index if not exists news_provider_article_uniq
  on news (provider, provider_article_id, instrument_id)
  where provider_article_id is not null;

-- 종목별 최신 조회는 0003 의 (instrument_id, published_at desc) 인덱스를 그대로 쓴다.
comment on column news.provider_article_id is
  '수집처 기사 고유키. 네이버는 office_id-article_id (예: 015-0005320819).';
