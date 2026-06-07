# 재개 메모 (RESUME) — 다음에 여기서부터

> 마지막 체크포인트: E2E 라운드트립 + 밸류에이션 실데이터 검증 완료(2026-06-07) · 브랜치 `master`
> 작성 기준일: 2026-06-07 (갱신)

## 지금까지 (완료, 동작 검증됨)

- **M1 기반**: 모노레포(`apps/web`·`apps/engine`·`packages/db`·`supabase`), CLAUDE.md, .env.example, docker-compose
- **M2 인제스트**(엔진): KRX(pykrx) 시세·수급·공매도, DART 재무 — 변환 순수함수 테스트 완료
- **M3 펀더멘털/밸류에이션**: 비율·DCF·상대가치 → `valuations`
- **M4 멀티팩터**: 섹터중립 z-score·합성알파 → `factor_scores`
- **M5 시그널(3축)**: 플레이북 4종(주도주/과대낙폭/돌파/종가베팅) × 스타일 × 세션 + 가격레벨(진입/TP/SL/R:R/비중)
- **M6 백테스트 게이트**: IC·Sharpe·MDD·승률 → 통과 셋업만 발행
- **엔진 테스트 70개 전부 통과** (`apps/engine`, venv: `.venv`)
- **M7 웹(다크 터미널 UI, shadcn 스타일)**: 사이드바 7메뉴 — 대시보드·스크리너·시장·모델포트폴리오·전략백테스트·리포트·워치리스트. 종목상세(차트·밸류·팩터·수급·리스크). **DB 미연결 시 심볼별 예시 폴백**.

## ✅ 2026-06-07 추가 완료 — E2E 라운드트립 실데이터 검증

- **로컬 Supabase 스택 기동**(Docker, CLI 2.105 — 신형 키 `sb_publishable_`/`sb_secret_`). 마이그레이션 0001~0008 전부 적용.
- **env 작성**: `apps/engine/.env.local`(URL+secret+DART), `apps/web/.env.local`(URL+publishable). 둘 다 gitignored.
- **엔진→DB 실적재**: `ingest prices --days 250`(815행, pykrx 실제 KRX 일봉) → `analyze factors`(10행) → `signals`(3건: 삼성전자·SK하이닉스·NAVER, leader_trend/swing/buy, 진입·SL·TP·R:R).
- **DB→웹 실표시**: `/screener`가 sample 폴백 아닌 **실DB 시그널 3건** 렌더링(HTTP 200, 진입가 329,000 등 확인).
- **RLS 빈틈 #2(일부) 해소**: 마이그레이션 `0008_public_market_read.sql` — 공개 시장데이터(signals/factor_scores/valuations/ohlcv/instruments/… 14개 + reports 공유)에 **anon SELECT** 추가. 사용자 소유 테이블·broker_credentials는 차단 유지(검증: anon→[]).

## ⚠️ 아직 안 한 것 / 알려진 빈틈 (다음 작업 후보)

1. ~~**end-to-end 라운드트립 미검증**~~ ✅ 코어 + **밸류에이션(M3)까지 완료**. DART 키 투입 → `ingest fundamentals --year 2024`(5종목 실제 연결재무 + 유통주식수) → `analyze valuation`(5행). 웹 종목상세가 **PER/PBR/ROE/DCF/업사이드 전부 실데이터** 표시(삼성 PER 56.7·PBR 4.86·ROE 8.6%). 주의: 멀티플이 높은 건 **2024 연간실적 대비 2025~26 가격 급등**(반도체 강세장) 반영 — 수학적으로 정확.
2. ~~**상장주식수(shares) 인제스트 없음**~~ ✅ **DART `stockTotqySttus`(주식의 총수 현황)로 해결** — pykrx의 cap/fundamental도 죽어서(아래 #3) pykrx 대신 DART 사용. `dart.fetch_shares`/`normalize_shares` 추가(`distb_stock_co` 유통주식수, 보통주 우선), `ingest fundamentals`가 financials.shares 채움. corp_code는 임시폴더 JSON 캐시(50MB zip 재다운로드 방지).
3. **수급(flows)·공매도 데이터 — 업스트림 차단**: pykrx 1.2.8(최신)의 투자자수급·공매도·시총·펀더멘털 엔드포인트가 KRX 백엔드 변경으로 **전부 빈 응답**(OHLCV만 정상, 날짜 무관 확인). 코드는 우아하게 처리하도록 수정(`krx._safe_krx`, 명확한 `flows.upstream_unavailable` 경고) — **데이터 복구는 대체 소스(KRX OpenAPI/네이버 등) 필요**. valuation은 shares를 DART로 우회해 영향 없음.
4. **아키텍처 정합성 수정 — 남은 것**:
   - `signals.position_size_pct`를 공유 시그널에 박아둔 것 → 사용자 무관 값(진입/손절/TP/R:R)만 저장하고 **비중은 읽기 시점에 사용자 `risk_per_trade_pct`로 계산**하도록 분리 (DB엔 여전히 박혀 있음)
   - **티어 게이팅**(Free 지연/요약 vs Pro 실시간) 앱 레이어(`lib/data.ts`) 미구현 — RLS는 0008로 anon 읽기 열어둠, 차등은 앱에서.
5. **factor_scores composite_alpha=0** — 5종목·섹터중립이라 거의 degenerate. 유니버스 확대(시드/인제스트) 후 재확인 필요.
6. **파생 산출물 전용 테이블 없음** — 레짐/섹터로테이션/리스크는 현재 샘플만. 등락%·스파크라인도 ohlcv 기반 실데이터 경로 없음.
7. **미구현 마일스톤**: M8 결제 · Phase 2 애널리스트 북(reports) · Phase 3 비수탁 봇(executor)

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
