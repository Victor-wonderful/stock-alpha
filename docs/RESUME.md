# 재개 메모 (RESUME) — 다음에 여기서부터

> 마지막 체크포인트: PEAD 분기 이력 인제스트(5련 중 4번째 진행) + UI V3 다크 시안 10화면 완성(2026-06-12 오후) · 브랜치 `master`
> 작성 기준일: 2026-06-12 (갱신)
> ⭐ 제품 피벗(2026-06): AI 리서치 애널리스트 + 유사투자자문 구독(신고 보유). 자동매매/일임 폐기. 메모리 `stock-alpha-product-strategy` 참조.

## 🔄 2026-06-12 — 자동 배치 검증 · PEAD 데이터 수집 · UI V3 다크 시안

- **자동 배치 무인 가동 첫 성공**(MSK 시간대 수정 유효): 모닝 02:30 MSK(레짐 risk_off -0.5) · 일일 10:30 MSK(리포트 100건, 트랙A 252·B 32, 픽 5, 열린 픽 7 관리).
- **게이트 출렁임 관찰**(6/12 일일 배치): oversold_bounce PASS로 복귀 · close_betting FAIL(0.034R) — 경계선 셋업은 데이터 추가마다 PASS/FAIL 오감. **pead 첫 판정 n=238 FAIL(-0.21R)** — 단, 이벤트가 2026Q1 한 라운드뿐인 상태의 예고편(아래 인제스트 완료 후 재판정이 진짜).
- **PEAD 분기 이력 인제스트(일일 한도 분할 1일차, ~19k 호출)**: ✅2025FY refresh(2,596, disclosed_at 백필) ✅2025Q1 refresh(2,529) ✅2024Q1(2,400) 🔄2025H1 ⏳2024H1. 완료 시 이벤트 4라운드(2026Q1·2025FY·2025Q1·2025H1) → `engine backtest`로 PEAD 게이트 재판정.
  - **내일(2일차, ~19k)**: 2025Q3+2024Q3(11014) → 라운드5 · 2024FY refresh+2023FY → 라운드6. 그 후 최종 판정 → 통과 시 웹 `ScreenerFilters.tsx ACTIVE_SETUPS`에 pead 추가.
- **UI V3 — Pencil Dark+Yellow 디자인 시스템 10화면 완성**(`design/stock-alpha-ui.pen`, 구버전 라이트/영문 시안은 사용자가 삭제):
  - 메뉴 8: 대시보드 · 오늘의 포커스 · 추천 종목(=전체 시그널: 셋업 필터+멀티팩터 검증중지 칩+스타일 4종(데이·스캘핑 잠금)+스파크+AI판정·점수) · 종목진단(포트폴리오 진단 병합: 등급 B+·섹터 도넛·개선 액션) · 종목 분석(날짜 그룹+접기) · 시장분석(레짐 히어로+매크로 6+수급·브레드스+**섹터 로테이션 사분면 맵**(모멘텀z×수급)+시그널 섹터 분포) · 워치리스트(오늘의 변화) · 알림(채널·토글·피드)
  - 서브 2: 리포트 상세(3층: 30초 요약/실행플랜+퀀트 핵심수치 6팩터/근거 접힘) · 픽 기록(불변 원칙)
  - UX 결정: 레짐 게이지를 행동 언어로("약세장·방어"빨강 ↔ "강세장·공격"초록 — 위험회피/위험선호 용어는 보조), 픽 5종 동일 로우+근거 접이식, 한국어 메뉴 확정(추천 종목=전체 시그널 내용임에 주의).
  - ⚠️ **.pen 디스크 저장 필요(Ctrl+S) 후 design/ 첫 커밋**.
- **✅ UI V3 코드 적용 완료(같은 날 저녁, 3단계·커밋 5b0283f→01e89c9)**: 토큰 스왑(다크+옐로, 상승=그린/하락=레드 — ⚠️한국 관례 빨강/파랑을 디자인 결정으로 덮음, 되돌리려면 globals.css bull/bear 2변수) · Sidebar→상단 GNB · 홈=대시보드 신설(마켓 스트립 7종: 코스피·코스닥 지수는 예시 배지 — KRX 지수 인제스트 백로그) · /focus·/screener·/reports·/reports/[id]·/market 재구현 · /diagnosis 등급+도넛+액션 · **/picks 신설(픽 기록 전체)** · /alerts 실피드 · /watchlist 미리보기. 전 라우트 200.
  - ⚠️ 함정 기록: 백그라운드 서브에이전트는 세션 워크트리에 쓴다(2단계 파일 메인 이식으로 해결, af8ca5d) + 백그라운드 에이전트는 권한 승인 불가(3단계는 직접 구현). `.next` 손상 500 재발 → 삭제·재기동으로 해결.
  - 남은 백엔드: 섹터 로테이션 러너(0013 적재 — /market은 샘플 폴백 중), 알림 설정 저장·텔레그램 발송, 워치리스트 로그인 CRUD, KRX 지수 인제스트.
- **✅ PEAD 게이트 PASS·발행 개시(같은 날)**: 인제스트 5련 완료(실패 13/12,538) → 이벤트 4라운드 946트레이드 — **기대값 +0.072R · 승률 34% · R:R 2.15 · R-MDD 4.4%**. 아침 1라운드 FAIL(-0.21R)이 표본 확충으로 반전. ACTIVE_SETUPS에 pead 추가, 시그널 271건 재발행(pead 2). 내일 2일차 인제스트(2025Q3·2024Q3·2024FY refresh·2023FY) 후 6라운드 최종 재확인.

## 🌅 내일(2026-06-11) 시작 시퀀스 — "시작하자" 하면 이 순서대로

> ✅ 1~3번은 11일 새벽에 완료됨 — 4번(배치 점검)부터 시작.

1. ~~8셋업 백테스트 결과~~ ✅ **(600일 검증 확정) 6종 PASS / 2종 FAIL**:
   - PASS: **52주 신고가 +0.249R**(최강) · 변동성 수축 +0.127 · 돌파 +0.119 · 주도주 +0.078 · 눌림목 +0.070 · 수급 매집 +0.057 — **신규 4종 전원 통과**
   - FAIL: 종가베팅 +0.028(250일 표본에선 통과였으나 600일에서 기준 미달 — 긴 표본이 정답) · 과대낙폭 -0.007 · 멀티팩터(횡단면 t=-0.04, IC 0.043은 유효 → 제외필터 후보)
2. ~~시그널 재생성~~ ✅ 통과 6종으로 76건(주도주 53·수급 13·눌림목 6·돌파 4 — 신고가/수축은 당일 트리거 없음, 희소 셋업 정상). 픽은 11일 리포트가 아직 없어 0 — 16:30 배치가 생성.
3. ~~스크리너 필터~~ ✅ 통과 6종만 노출.
4. **자동 배치 첫 무인 가동 점검**: 08:30 모닝(`logs\morning-20260611.log`, /focus 브리프 갱신) · 16:30 일일(`logs\daily-20260611.log`, 리포트/픽). 실패 시 작업 스케줄러 "Interactive only" 로그온 모드가 원인일 수 있음(로그인 상태에서만 실행됨).
   - 16:30 배치 후 확인 포인트: 트랙 A 가 신규 셋업 포함 6종 기준으로 도는지, 픽 생성되는지, 종가베팅 시그널이 발행 안 되는지.
   - ⚠️ **시간대 함정 발견·수정(6/11)**: 이 PC 는 **모스크바 시간(MSK, UTC+3)** — KST=MSK+6. 기존 트리거 08:30/16:30 은 로컬(MSK) 기준이라 실제 **14:30/22:30 KST**(모닝 브리프가 장중 발행!). → 트리거를 **02:30/10:30 MSK(=08:30/16:30 KST)** 로 변경 + StartWhenAvailable(지각 따라잡기) 켬. 단 02:30 MSK 실행엔 PC 켜짐+로그인 필요(Interactive). 엔진 `date.today()` 는 두 배치 시각 모두 KST 날짜와 일치(MSK 18~24시 배치만 위험)라 안전. 6/11 일일 배치는 수동 1회 기동으로 보충.
5. 검증 페이지(/strategies)에서 신규 셋업 6종 결과 표시 확인 → 이후 아래 백로그 진행.

## ✅ 2026-06-11 오후 — 분기 재무 + growth 팩터 + 픽 5슬롯 + 시간대 수정

- **DART 분기 재무 인제스트 완료**: 2025FY 2,597 + 2026Q1 2,548 + 2025Q1 2,529 (실패 0). `--reprt` CLI 옵션, resume 키 수정, 분기는 주식수 호출 생략(DART 일일 2만건 가드).
- **함정 차단(periods.py)**: 분기 행은 문자열 정렬상 "2026Q1">"2025FY" → 밸류에이션·팩터 레벨 지표가 분기 손익을 연간 오인(PER 4배). 레벨=최신 FY만, growth=같은 보고서 타입 전년 동기 YoY.
- **밸류에이션 2025FY 갱신**(2,553행): 삼성 PER 56.7→38.5, 하이닉스 ROE 35.6% — "2024실적 대비 2026가격" 부풀림 해소.
- **growth_z 활성화**: 0 → 2,358종목(σ1.0). composite_alpha σ0.39→0.448. 판다스 버그 2건 수정(object dtype pd.NA→astype 사망: 단면 coerce + compose np.nan).
- **픽 하한 60→50**: 6/11 픽 5건(SK스퀘어·티에스이·엘티씨·신세계·롯데쇼핑). 빈 날 원칙 유지.
- **배치 시간대 수정**: PC=MSK(UTC+3). 트리거 02:30/10:30 MSK(=08:30/16:30 KST)+StartWhenAvailable. 일일 배치 첫 가동 성공(A:96 B:40 발행 96).

## 🚧 PEAD 셋업 — 코드 완성(0019), 데이터 수집 중

- **구현 완료(2026-06-11 저녁)**: detect_pead(공시 6일 내 + 영업이익 YoY 30%+/흑자전환 + MA20 확인, position), earnings.py(공시일 기준 이벤트, disclosed_at=DART rcept_no 접수일 — 추정 금지), 시그널·백테스트 배선, `--refresh` 백필 플래그. 테스트 143개.
- **백테스트 게이트는 과거 분기 이력이 더 필요** — 600일 윈도 내 이벤트(2025-03~2026-05 공시 6회)의 YoY 짝:
  - ✅ 보유: 2024FY·2025FY·2025Q1·2026Q1 (2026Q1 은 disclosed_at 백필 재인제스트 중)
  - ⏳ **내일 DART 한도(일 2만건) 리셋 후 인제스트**: `--year 2025 --reprt 11012`(H1) · `--year 2025 --reprt 11014`(Q3) · `--year 2024 --reprt 11013/11012/11014` · `--year 2023`(FY, 2024FY 짝) + **2025FY·2025Q1 `--refresh`**(disclosed_at 백필)
  - 그 후 `engine backtest` → PEAD 게이트 판정 → 통과 시 스크리너 필터 추가(ACTIVE_SETUPS).
- 오늘 사용량 ~16k/20k — 분할 필수.

## ✅ 2026-06-11 밤 — UI V2 (라이트 토스 톤) 디자인 + 코드 적용

- **디자인 시안**: `design/stock-alpha-ui.pen` (Pencil) — 실구조 기반 6화면(포커스·리포트 상세·종목 분석 리스트 × 웹/앱) + 공유 컴포넌트·토큰. 텍스트 다이어트(한줄요약+태그), 컬러 코딩(중립=앰버·목표/손절 틴트·PASS그린/FAIL레드), 선정 과정 3단계 스트립.
- **코드 적용 완료(3화면)**: 토큰 스왑(globals.css가 단일 출처, bull=빨강/bear=파랑 한국 관례 전환 포함) → 전 페이지 라이트화. /focus(2단+스트립+판정 스탯+픽 기록 미니), /reports(날짜 그룹핑+판정 필터+⭐오늘의 픽 배지+점수), /reports/[id](2단+게이트 레일). getReports에 verdict.score 추가.
- **시간대 버그 수정**: 날짜 라벨이 MSK 서버에서 하루 밀림(+09:00 앵커를 로컬 getter로 읽음) → UTC 달력 연산. focus 플랜일 라벨의 잠복 버그도 동일 수정.
- **나머지 화면 점검 완료**: /screener·/strategies·/diagnosis·/stocks/[s]는 토큰 전환만으로 양호. /market 레짐 게이지 복구 — **tailwind 컬러를 color-mix 래핑**해 CSS 변수 컬러에 알파 수정자(bg-bull/40, bg-bg/80 등) 작동 복원(전역 잠복 버그였음).
- **리포트 상세 3층 구조**: 한눈에 보기(판정+결론+최우선 리스크 앰버 박스) / 행동 정보(플랜·게이트) / 근거 문단은 기본 접힘. /reports 리스트는 날짜 그룹당 10건+접기.
- **Pencil 시안 동기화됨**: design/stock-alpha-ui.pen — 코드 변경(요약 히어로·근거 접힘·펼치기 버튼) 반영 완료.

## ✅ 2026-06-12 밤 — KIS 연동 + 시스템 견고화

- **KIS OpenAPI 연동(실전 키, KIS_ENV=auto 자동감지)**: 지수(코스피·코스닥 당일 종가, 네이버 폴백) · 수급 4종(개인·외인·기관·프로그램 — 전 종목 27,813행 적재, 일일 배치 연결) · 당일 1분봉(ohlcv 1m, `ingest-minutes`) · 현재가. 함정: 프로그램 API DATE_1=끝 앵커. 토큰 분당 1회 제한 → 24h 파일 캐시.
- **환율 당일화**: 네이버 매매기준율 → macro USDKRW (FRED DEXKOUS D-7 지연 해소). 마켓 스트립 7종 전부 실데이터 + 기준일 표시.
- **견고화 5종(68595e4·c9f884a)**: ① 게이트 히스테리시스(0020 — passed=2연속 동일 측정시만 전환, passed_raw 별도) ② DART 쿼터 가드(KST 일카운터→DartQuotaError 시 잔여 취소) ③ **DB 백업 자동화**(StockAlpha-DbBackup 11:30 MSK, docker cp 방식 — ⚠️PS `>` 리다이렉션이 gzip 을 UTF-16 으로 파괴) ④ 인제스트 active 필터(비활성 1,300종목 호출 제거) ⑤ 웹 limit-집계 버그 4곳(스크리너 총계·리포트 부분 그룹·픽 배지·포커스 분포).
- 텔레그램 운영봇 알림은 사용자 결정으로 보류(시스템 우선).

## 📋 개발 백로그 (우선순위순)

- **factor_composite point-in-time 재검증** — 분기 이력 확보로 6팩터 전체 재검증 경로 열림(현재 xsec FAIL, 하위 제외 필터 후보).
- **KIS 분봉 연동** — 종가베팅이 600일 게이트 FAIL이라 동기 약화. 데이트레이딩 실시간 장기 과제로 보류.
- **factor_composite 재활용** — 횡단면 결과(IC 유효·톱데실 무효)의 함의: 매수 신호가 아니라 **하위 제외 필터**로 사용 검토.
- **M8 결제 + 티어 게이팅** — Free(요약)/Pro(전체) 차등, 구독 BM 실체화.
- 공매도 데이터 소스(KRX 정보데이터시스템) → 공매도 스퀴즈 셋업.
- UI 재설계 V2(모바일·토스 톤) / 픽 알림 채널(텔레그램).
- 트랙레코드 누적 후(수 주) 픽 성과 요약 통계 노출.

## ✅ 2026-06-10 심야 2차 — 신규 플레이북 4종 (전문가 제안 Tier 1 전체)

- **탐지기 4종 구현·테스트(124개 통과)**: 수급 동반 매집(flow_accumulation — 외인+기관 10일 동반 순매수+MA20 확인, flows 데이터 point-in-time 배선), 눌림목(pullback — 추세 중 MA20 조정 매수), 52주 신고가(high_52w — 포지션 스타일), 변동성 수축 돌파(vol_squeeze). enum 0018.
- **알파 원천 다변화 논리**: 기존 3종 전부 단기 추세 추종 → 수급/조정매수/장기모멘텀/변동성구조 추가. 평균회귀 재도전 금지(과대낙폭 전구간 음수 확인), 셋업은 게이트 통과 후에만 필터 노출(유령 필터 금지).
- **백테스트는 내일 아침 결과 확인** — 첫 실행이 0원 가격 ZeroDivision 으로 사망 → 가드+회귀테스트 추가 후 재실행 중. Tier 2~3(PEAD·공매도 스퀴즈·장중)은 백로그 참조.

## ✅ 2026-06-10 세션 결과 (피벗 V1 골격 완성)

- **AI 종목 심층분석 리포트** (`engine report indepth`/`daily`): ①판정 ②거래가능 게이트 ③실행플랜(진입/손절/TP/R:R/**권장 비중**) ④트레이더+퀀트 근거(Claude 서술, 수치는 source_refs) ⑤리스크·면책. '거래 부적합'은 목록 기본 숨김 + LLM 생략(템플릿).
- **발행 규정 v1** (`engine/reports/daily.py` + `cli daily` + 작업 스케줄러 평일 16:30 `StockAlpha-DailyBatch`): 트랙 A(게이트 통과 EOD 시그널)/B(시총 상위 50, 판정 동일 3일내 스킵)/C(매수=Opus, 그 외 Sonnet). 상한 100/일. EOD=스윙·포지션만(종가베팅은 향후 15:00 장중 배치, 데이는 KIS 실시간 후).
- **오늘의 포커스** (`/focus`, 홈): 매수 ∪ (점수60+&게이트플랜) → 상위 5, 빈 날 허용, recommendations(daily_focus) 일별 스냅샷. "다음 거래일 장 시작 전 플랜" 프레이밍. 진입 상태(진입권/대기/무효) 읽기 시점 판정 + 만료 배지.
- **IA 개편**: 오늘의 포커스 > 종목 분석 > 전체 시그널 > 시장 > 검증·트랙레코드 > 워치리스트. 첫 화면이 답.
- **게이트 최종 모델** (3차 진화): 기대값 ≥+0.05R(승률/손익비 하한 폐지) + 윈저라이즈 ±10R + 최소 손절폭(¼ATR, 백테스트=라이브 단일화) + **MDD=일별 리스크 예산 곡선**(시간순·하루 1% 균등분할 — 임의순서 비결정과 "전부 집행" 가정의 군집 폭발 둘 다 해소). **최종: leader_trend(+0.11R)·breakout(+0.21R)·close_betting(+0.06R) PASS · oversold_bounce FAIL(기대값 음수)**. 시그널 254건(유동성 10억+ 유니버스 1,251종목).
- **KOSPI/KOSDAQ 복구**: exchange 컬럼 정위치(`backfill-exchange`), 스크리너 시장 필터.
- **시장 맥락 + 모닝 브리프(밤 추가)**: `engine/ingest/fred.py`(매크로 6시리즈) + `engine/market/regime.py`(레짐 v2 — 모멘텀·브레드스·외인수급) + `engine/reports/morning.py`(market 리포트, 하루 1건). `cli morning` + **작업 스케줄러 StockAlpha-MorningBatch 평일 08:30**. /focus 최상단 시장 브리프 카드.
- **픽 기록(실발행 트랙레코드)**: /focus 하단 — 모든 픽의 진입가 대비 수익률·상태(진행중/목표/손절) 공개, 삭제 금지 원칙. 제품 갭 프레임(맥락→진입→관리→결과)에서 [결과]와 [맥락] 채움 — 남은 건 [관리](손절/목표 알림)와 포트폴리오 진단.
- 마이그레이션 0014~0017 적용. 엔진 테스트 115개 통과. 자동 배치 2개: 08:30 모닝 / 16:30 일일.

## ✅ 2026-06-10 심야 추가 — 횡단면 검증·픽 관리·포트폴리오 진단

- **횡단면 백테스트**(`backtest-factor`, `engine/backtest/cross_section.py`): 주간 39기, 가격 팩터 프록시(모멘텀12-1+저변동). **판정: IC +0.043(유효)·양수 67%지만 상위 10% 매수 초과수익 무유의(t=-0.04) → FAIL** → factor_composite 시그널 138건 발행 중지(게이트 원칙), 검증 페이지에 실측 공개. 재검증 경로: 재무 팩터 point-in-time(분기 재무 이력) 확보 후 전체 합성으로, 또는 가중/분위 재설계 후 xsec 재통과.
  - 이를 위해 **시세 이력 600일(거래일 ~410봉)로 확장** (모든 백테스트 공용 자산).
  - 현재 발행 시그널 116건 = 검증 통과 3종(주도주 추세 70·종가베팅 38·돌파 8)만.
- **픽 관리(0017)**: 일일 배치가 열린 픽을 종가로 확정(목표/손절/만료 30일) → recommendations.status/exit_price/close_return_pct 영구 기록(트랙레코드). 웹 픽 기록은 확정값 우선.
- **포트폴리오 진단**(`/diagnosis`, 메뉴 3번): 보유 종목+비중 입력(미저장) → 종목별 판정·알파·업사이드·베타·경고 + 가중 알파/베타/변동성·섹터 집중 경고. 갭 프레임 [관리]·[내 것] 채움 — 4조각 모두 완료.
- **수급(flows)은 어제 이미 전체 배치 완료** 확인(2,561종목 14.2만 행) — RESUME 항목 #3 잔여분 해소.

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
