-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0010 — signals 자연키 unique (재실행 멱등화, 중복 방지)          ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 문제: signals 는 PK 가 serial id 뿐이라 시그널 재생성 시 같은
--   (종목·스타일·셋업·세션·방향) 조합이 매번 새 행으로 쌓였다(중복).
-- 해결: 자연키에 unique 를 걸고 엔진은 on_conflict 로 업서트(같은 id 갱신).
--   → alerts.signal_id FK 도 유지됨(행 교체가 아니라 갱신이므로).

-- 기존 중복 제거: 자연키별 최신(max id) 한 건만 남김.
delete from signals s
using signals s2
where s.instrument_id = s2.instrument_id
  and s.style = s2.style
  and s.setup = s2.setup
  and s.session = s2.session
  and s.signal_type = s2.signal_type
  and s.id < s2.id;

alter table signals
  add constraint signals_natural_key
  unique (instrument_id, style, setup, session, signal_type);
