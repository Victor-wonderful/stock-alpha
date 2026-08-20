-- 주간 브리핑 리포트 종류 추가.
--
-- 지금까지 시장 산출물은 매일 아침 시황(report_type='market') 하나뿐이었다.
-- 홈의 「주간 브리핑」은 한 주를 한 문장으로 요약하는 별개 산출물이라 종류를 나눈다.
-- 같은 'market' 으로 섞으면 시황 조회(morning brief, /market)가 주간 건을 함께 집어간다.
--
-- 주의: ALTER TYPE ... ADD VALUE 는 같은 트랜잭션 안에서 그 값을 쓸 수 없다.
-- 이 마이그레이션은 값 추가만 하고, 실제 발행은 이후 실행에서 일어난다.
alter type report_kind add value if not exists 'weekly';
