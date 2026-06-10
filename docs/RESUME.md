# 재개 메모 (RESUME) — 다음에 여기서부터

> 마지막 체크포인트: AI 인뎁스 리포트 MVP 발행·웹 검증 완료(2026-06-10) · 브랜치 `master`
> 작성 기준일: 2026-06-10 (갱신)
> ⭐ 제품 피벗(2026-06): AI 리서치 애널리스트 + 유사투자자문 구독(신고 보유). 자동매매/일임 폐기. 메모리 `stock-alpha-product-strategy` 참조.

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
3. ~~**수급(flows) 데이터 — 업스트림 차단**~~ ✅ **네이버 금융으로 복구**. pykrx 투자자수급·공매도·시총·펀더멘털 엔드포인트는 여전히 죽음(OHLCV만 정상). `engine/ingest/naver.py`(`fetch_frgn`/`parse_frgn_table`/`normalize_flows`, euc-kr·lxml) 추가 → `item/frgn.naver`에서 **외국인·기관 순매매** 수집, `ingest flows`가 flows 적재(300행, DB=네이버 일치 검증). 웹 종목상세 수급 탭 실데이터. **남은 것: 공매도(short_*)·개인·프로그램** — 이 페이지에 없음(KRX 공식/KIS 등 별도 소스 필요). 장기적으론 KIS OpenAPI 로 수급+실시간+주문 통합 권장.
4. **아키텍처 정합성 수정**:
   - ~~`signals.position_size_pct` 분리~~ ✅ **완료** — 마이그레이션 `0009`로 컬럼 제거, 엔진 `generate.py`는 비중 미저장(진입/손절/TP/R:R만). 웹 `lib/position.ts`가 entry/stop + 사용자 `risk_per_trade_pct`(profiles, 비로그인=1.0 기본)로 **읽기 시점 계산**. 검증: 삼성 11.08%·SK 25%(상한)·NAVER 6.78% = 기존값과 일치. 이제 사용자가 risk 바꾸면 엔진 재실행 없이 비중 갱신.
   - **티어 게이팅**(Free 지연/요약 vs Pro 실시간) 앱 레이어(`lib/data.ts`) 미구현 — RLS는 0008로 anon 읽기 열어둠, 차등은 앱에서. (남은 작업)
5. ~~**유니버스 5종목**~~ ✅ **전체 코스피·코스닥 3,859종목 확장**. `engine/ingest/universe.py`(네이버 시총목록 파싱, pykrx 종목목록도 죽어서 네이버 사용) + `seed-universe` CLI. OHLCV 병렬 인제스트(ThreadPool 12워커, 순차 대비 ~28배, 622,060행). **systemic 버그 수정**: PostgREST 1000행 제한 → `db.select_all` 페이지네이션(instruments 조회 5곳 적용). factors 3,864 / **signals 1,214건·1,137종목**(4 플레이북 전부 발동) → 스크리너 실데이터로 가득.
6. ~~**factor composite_alpha 빈약**~~ ✅ **가격팩터 산출로 해결**. `factors/runner._load_cross_section`이 ohlcv 히스토리로 **모멘텀(12-1)·변동성** 계산(전 종목). composite_alpha 3값→**2,651 distinct**(σ0.18, -0.56~0.84). + **`factor_composite` 시그널 생성기**(`signals/factor_signals.py`) 구현 — 합성알파 상위 10% → 매수 시그널(386건). 스크리너 '멀티팩터 종합' 필터 실작동. (가치/성장 팩터는 여전히 재무 5종목만 — 아래 #7. ETF/ETN이 모멘텀 상위에 섞임은 향후 asset_type 필터로 정제)
7. ~~**유니버스 정제 + 전체 재무 배치**~~ ✅ **완료**. ETF/ETN/펀드(1,252)·스팩(46) 비활성화(`classify_universe`, DART corp_code 유무로 판정) → **활성 실주식 2,561**(=코스피+코스닥 전체 보통주). DART 재무 **2,544종목 배치 완료**(병렬20워커+재개가능, 실패0, 주식수 포함). 최종 재계산: factor_scores 2,566(**6팩터 활성** — value 2,375·quality 2,359, composite_alpha σ0.18→**0.39**·2,321 distinct), valuations **2,500**(PER/PBR/DCF 2,367종목), signals 739(factor_composite 256). 스크리너·종목상세 밸류탭 전 종목 실데이터.
   - **남은 것**: 수급(네이버)은 아직 5종목만 — 전체 배치 필요. growth 팩터는 다기간 재무 없어 미활성(단일 연도만). PER/PBR 높음은 2024실적 대비 2026가격 급등(정상).
8. **파생 산출물 전용 테이블** — 🟡 진행 중. 마이그레이션 0011_risk_metrics/0012_market_regime/0013_sector_rotation 적용됨 + 웹 연결 코드(6/9 WIP 커밋 `e435a81`). 엔진 계산 러너 연결·적재는 미완.
9. ~~**Phase 2 애널리스트 리포트**~~ ✅ **인뎁스 MVP 완료(2026-06-10)**. 피벗(메모리 `stock-alpha-product-strategy` — AI 리서치+유사투자자문, 신고 보유) 후 첫 기능.
   - 엔진 `engine/reports/`: context(수치+source_refs, 환각 차단) → 거래가능 게이트(활성·유동성 1억·ATR12%·백테스트 게이트) → 종합판정(팩터40/밸류30/시그널30, 매수≥65/중립≥45/관망/거래부적합) → Claude 서술(`claude-opus-4-8`, 키 없으면 템플릿 폴백) → reports 업서트(0014 자연키 `report_type,instrument_id,as_of`).
   - CLI: `report indepth --symbols 005930` 또는 `--top N`(합성알파 상위 자동). 웹 `/reports`(목록)·`/reports/[id]`(5섹션 상세) — 검증 완료(HTTP 200, Claude 서술 실데이터).
   - **함정 발견**: backtests 테이블이 비어 있었음(M6 구현됐지만 실DB 적재는 처음) → `engine backtest` 첫 실행으로 채움. 부분 유니크 인덱스는 PostgREST on_conflict 불가 → 전체 유니크로 변경.
   - **게이트 재캘리브레이션 완료(같은 날)**: 승률/손익비 개별 하한 → **기대값 ≥ +0.05R 통합**, MDD → **R 곡선(리스크 1%)**, 이상치 위생(손절폭 < ¼ATR·0.1% 제외 + ±10R 윈저라이즈). 진단: +53R 급 이상치 17건이 기대값 부호를 뒤집고 있었음(`scripts/diag_r_dist.py`). 판정은 `backtests.passed`(0015)에 저장, 웹·리포트는 read만.
   - ~~정직한 결론: 전 플레이북 FAIL~~ → **원인 규명·해결(같은 날 오후)**: FAIL 의 원인은 전략이 아니라 **비유동 잡주 오염**이었음. 진단(`scripts/diag_playbook_breakdown.py`) — 거래대금 10억+ 구간에서 3종 기대값 양수, 1억 미만은 전부 큰 음수(breakout -0.91R). 수정: `engine/liquidity.py`(시그널·백테스트 유니버스 10억 하한 / 리포트 거래가능 1억) + 최소 손절폭(`levels.min_risk_floor`, ¼ATR·0.1%) 백테스트=라이브 단일화.
   - **최종 게이트(유동 유니버스 1,251종목 전수): breakout PASS(+0.21R·R-MDD 35%) · close_betting PASS(+0.06R·25%) · leader_trend FAIL(+0.11R 우수하나 R-MDD 55%) · oversold_bounce FAIL(엣지 없음)**. 시그널 재발행 183건(돌파 8·종가베팅 38·멀티팩터 137). 리포트: 게이트 통과 셋업 종목은 '중립'(점수 65↑면 '매수'), factor_composite 단독 종목은 횡단면 검증 전까지 '거래 부적합' — 정직한 상태.
   - **다음 작업: 횡단면 백테스트(IC·분위수 스프레드, ohlcv 기반 point-in-time 모멘텀부터)** — factor_composite(시그널 137건, 최대 비중) 게이트 검증. leader_trend 는 R-MDD 개선(트레일링 스탑/레짐 필터 등) 여지.
10. **미구현 마일스톤**: M8 결제 · 마켓/포트폴리오 리포트 타입 · 포트폴리오 진단. (Phase 3 봇은 피벗으로 폐기)

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
