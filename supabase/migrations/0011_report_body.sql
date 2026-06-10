-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0011 — AI 리포트 본문/구조화 페이로드 + 일별 자연키              ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 결정(2026-06-10): 리포트는 ①판정 ②거래가능 게이트 ③진입/TP/SL 실행플랜
--   ④트레이더+퀀트 근거 ⑤리스크·면책 의 5섹션 구조.
--   payload(jsonb) = 코드가 계산한 구조화 수치(웹 렌더링 원본, 환각 차단),
--   body_md(text)  = 동일 내용의 마크다운(내보내기/검색용).

alter table reports
  add column if not exists body_md text,
  add column if not exists payload jsonb;

-- 같은 종목·같은 날짜의 인뎁스 리포트는 1건 — 재실행 시 갱신(upsert).
create unique index if not exists reports_indepth_daily
  on reports (report_type, instrument_id, as_of)
  where instrument_id is not null;
