-- 0033 — 뉴스·공시가 주가에 미친 영향의 '성적표'
--
-- 목적: 사용자가 뉴스를 보고 "그래서 이거 사도 되나?"를 물을 때, 감이 아니라 **세어본
-- 결과**로 답하기 위한 근거를 남긴다. 지금까지 우리 서비스는 뉴스를 보여주기만 했고
-- 판단은 사용자 몫이었다.
--
-- 무엇을 재는가 — 시장 대비 초과수익(그 종목 등락 − 그날 시장 평균 등락). 시장이
-- 통째로 오른 날 같이 오른 건 그 뉴스의 공로가 아니기 때문이다.
--
-- 첫 측정에서 드러난 것(2026-08-16, 공시 2,845건 / 2개월):
--   자사주 매입  n=210  한 달 뒤 +8.0%  승률 73%   ← 사도 되는 소식
--   공급계약     n=693  한 달 뒤 -6.8%  승률 35%   ← 며칠 오르고 되돌린다(함정)
-- '수주 났다'는 개인 투자자가 가장 많이 사는 뉴스인데, 그게 가장 나빴다.
--
-- 주의 — 표본 기간이 2개월뿐이다. 그래서 verdict 는 표본이 충분한 종류만 good/caution
-- 을 주고 나머지는 insufficient 로 둔다. 화면은 insufficient 를 '아직 판단 못 함'으로
-- 표시해야 한다. 없는 근거를 있는 척하는 게 이 표의 존재 이유를 무너뜨린다.

create table if not exists event_evidence (
  source        text not null,            -- 'disclosure' | 'news' | 'calendar'
  event_type    text not null,            -- disclosures.event_type 등
  n             integer not null,         -- 관측 표본 수(창을 온전히 채운 건만)
  -- 시장 대비 초과수익. 공시 다음 거래일 시가 진입 가정(접수 시각을 모르므로 보수적).
  car_1d        numeric(10,6),
  car_5d        numeric(10,6),
  car_20d       numeric(10,6),
  car_20d_net   numeric(10,6),            -- 왕복 거래비용 차감
  win_20d       numeric(6,4),             -- 20일 초과수익이 양(+)인 비율
  median_20d    numeric(10,6),            -- 평균은 이상치에 끌린다 — 중앙값도 남긴다
  n_excluded    integer not null default 0,  -- 기준 변경(감자·병합)으로 제외한 건
  verdict       text not null,            -- good | caution | neutral | insufficient
  window_start  date,
  window_end    date,
  source_version text,
  measured_at   timestamptz not null default now(),
  primary key (source, event_type)
);

alter table event_evidence enable row level security;

drop policy if exists event_evidence_anon_read on event_evidence;
create policy event_evidence_anon_read on event_evidence
  for select to anon, authenticated using (true);

comment on table event_evidence is
  '이벤트 유형별 실측 성적표. 화면의 모든 "이 뉴스는 어떻다" 문장은 이 표를 근거로 한다.';
comment on column event_evidence.n_excluded is
  '감자·액면병합처럼 주가 기준이 바뀐 구간. 수익률 계산이 불가능해 제외한 건수.';
comment on column event_evidence.verdict is
  'insufficient = 표본 부족. 화면은 "아직 판단 못 함"으로 표시할 것.';
