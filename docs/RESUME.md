# 재개 메모 (RESUME) — 다음에 여기서부터

> 마지막 체크포인트: 커밋 `493f513` "feat: Phase 1 MVP" · 브랜치 `master`
> 작성 기준일: 2026-06-07

## 지금까지 (완료, 동작 검증됨)

- **M1 기반**: 모노레포(`apps/web`·`apps/engine`·`packages/db`·`supabase`), CLAUDE.md, .env.example, docker-compose
- **M2 인제스트**(엔진): KRX(pykrx) 시세·수급·공매도, DART 재무 — 변환 순수함수 테스트 완료
- **M3 펀더멘털/밸류에이션**: 비율·DCF·상대가치 → `valuations`
- **M4 멀티팩터**: 섹터중립 z-score·합성알파 → `factor_scores`
- **M5 시그널(3축)**: 플레이북 4종(주도주/과대낙폭/돌파/종가베팅) × 스타일 × 세션 + 가격레벨(진입/TP/SL/R:R/비중)
- **M6 백테스트 게이트**: IC·Sharpe·MDD·승률 → 통과 셋업만 발행
- **엔진 테스트 70개 전부 통과** (`apps/engine`, venv: `.venv`)
- **M7 웹(다크 터미널 UI, shadcn 스타일)**: 사이드바 7메뉴 — 대시보드·스크리너·시장·모델포트폴리오·전략백테스트·리포트·워치리스트. 종목상세(차트·밸류·팩터·수급·리스크). **DB 미연결 시 심볼별 예시 폴백**.

## ⚠️ 아직 안 한 것 / 알려진 빈틈 (다음 작업 후보)

1. **end-to-end 라운드트립 미검증** — 웹은 전부 *예시 데이터*. `supabase start`로 DB 올리고 엔진→DB→웹 한 바퀴 실제로 돌려본 적 없음. (가장 먼저 할 가치 큼)
2. **아키텍처 정합성 수정 2건**:
   - `signals.position_size_pct`를 공유 시그널에 박아둔 것 → 사용자 무관 값(진입/손절/TP/R:R)만 저장하고 **비중은 읽기 시점에 사용자 `risk_per_trade_pct`로 계산**하도록 분리
   - **티어 게이팅**(Free 지연/요약 vs Pro 실시간)이 웹 `lib/data.ts`에 미구현 + RLS 실제 DB 미적용
3. **파생 산출물 전용 테이블 없음** — 레짐/섹터로테이션/리스크는 현재 샘플만(전용 테이블·엔진 산출 추가 필요). 등락%·스파크라인도 ohlcv 기반 실데이터 경로 없음
4. **미구현 마일스톤**: M8 결제 · Phase 2 애널리스트 북(reports) · Phase 3 비수탁 봇(executor)

## 사용자(나) 준비물 — 실데이터 라운드트립 전제

- `DART_API_KEY` 발급 (opendart.fss.or.kr) — 재무용 (시세·수급은 pykrx, 키 불필요)
- `supabase start` (Docker 필요) → 출력된 URL·anon·service_role 키
- 루트 `.env.local`(`.env.example` 복사) + `apps/web/.env.local` 채우기

## 재개 명령 (빠른 시작)

```powershell
# 웹 dev (포트 3000은 Open WebUI 점유 → 3210 사용)
cd D:\Stock-Alpha\apps\web ; npx next dev --port 3210
#   → http://localhost:3210  (screener/market/portfolio/strategies/stocks/005930)

# 엔진 테스트
cd D:\Stock-Alpha\apps\engine ; .\.venv\Scripts\python.exe -m pytest -q

# (DB 준비 후) 라운드트립
cd D:\Stock-Alpha ; supabase start ; supabase db push
cd apps\engine ; pip install -e .
python -m engine.cli ingest prices ; python -m engine.cli ingest fundamentals
python -m engine.cli analyze valuation ; python -m engine.cli analyze factors
python -m engine.cli signals --gate
```

## 환경 주의 (반복되는 함정)

- 웹 dev 서버는 **한 번에 하나만** (둘이면 `.next` 매니페스트 충돌 → 500). Preview MCP 쓸 땐 수동 서버 먼저 끄기.
- 잦은 HMR 후 `__webpack_modules__ is not a function` 500 → `.next` 삭제 후 재기동.
- 빌드/실행은 **Turbopack** 권장(webpack은 D:드라이브 readlink EISDIR).
- 첫 페이지 진입은 컴파일로 2~7초.

## 추천 다음 순서

1. (DB 준비되면) **라운드트립 1회** — 아키텍처 "맞음" 증명
2. **position_size_pct 분리 + 티어 게이팅** 리팩터
3. 파생 테이블(레짐/섹터/리스크) + 등락%·스파크 실데이터
4. M8 결제 → Phase 2 리포트
