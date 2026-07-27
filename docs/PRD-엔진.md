# PRD — Stock-Alpha 분석 엔진 (apps/engine)

> 작성일: 2026-06-29 · 범위: `apps/engine` (Python 3.12) · 종합 출처: `docs/PLAN.md` · `docs/STRATEGY.md` · 코드
> 상태: 핵심 파이프라인 가동 중 (인제스트·팩터·밸류·레짐·시그널·게이트·리포트). LLM 리포트는 키만 있으면 가동.

---

## 1. 요약 (Summary)

분석 엔진은 Stock-Alpha의 **심장이자 공장**이다. 공개·저가 데이터(DART·FRED·KIS·pykrx)를 모아 정규화하고, 멀티팩터·밸류에이션·수급·레짐을 계산해, 백테스트 게이트를 통과한 **시그널·추천·AI 리포트**를 단일 공유 스토어(Supabase)에 기록한다. 웹·모바일·리포트는 이 산출물을 **읽기만** 한다. 엔진의 제1원칙은 **"수치는 코드가 계산한다(환각 차단)"**와 **"검증 미통과는 발행 금지"**다.

---

## 2. 담당자 (Contacts)

| 이름 | 역할 | 비고 |
|---|---|---|
| Victor (cjstkdry@gmail.com) | 엔진 오너 · 개발 | 파이프라인·게이트 정책 결정 |
| 일일 배치 워커 | 무인 실행자 | morning(08:30)·daily(16:30) KST |
| 클라이언트(웹·모바일·리포트) | 산출물 소비자 | read 전용 |

---

## 3. 배경 (Background)

- **무엇인가:** 증권사 리서치센터의 데이터·퀀트 파이프라인을 1인이 운영 가능한 코드로 구현한 것. RSI/MACD식 지표가 아니라 재무·밸류·수급·매크로를 알파의 근거로 쓴다.
- **왜 필요한가:** 클라이언트(웹·모바일)는 화면만 그린다. 데이터 수집·점수화·검증·리포트 생성이라는 "무거운 진실"은 한 곳(엔진)에 모여야 모순이 없고, 환각·과적합·낡은 데이터 사고를 막을 수 있다.
- **설계 원칙 (CLAUDE.md):**
  - 단일 공유 스토어 — 엔진만 write, 나머지는 read.
  - 투자 스타일이 1급 차원 — 같은 종목도 스타일별 다른 진입/TP/SL.
  - 시그널 품질 게이트 — 백테스트 미통과 발행 금지.
  - 리포트 환각 차단 — 모든 수치는 코드 계산값 주입, LLM은 서술만, `source_refs`로 근거 추적.
  - 재현성 — 모든 산출물에 `source_version` 기록.

---

## 4. 목표 (Objective)

**목표:** 매 영업일, **신뢰할 수 있고 검증된** 분석 산출물(팩터·밸류·시그널·추천·리포트)을 자동으로 생산해 스토어에 적재한다.

**핵심 결과 (Key Results):**
- KR1: 백테스트 게이트 미통과 셋업의 발행 **0건**.
- KR2: 신선도 가드 — 목표 거래일 봉을 60% 미만 보유 시 발행 **자동 중단**(낡은 종가로 "오늘 분석" 사고 차단).
- KR3: 모든 리포트 수치 = DB 값과 일치(환각 0). 모든 산출물에 `source_version`·`source_refs`.
- KR4: 일일 배치(인제스트→팩터→게이트→시그널→리포트)가 무인으로 완주, 실패 시 재시도·catch-up.
- KR5: 동일 종목 4스타일이 서로 다른 진입/TP/SL과 정합적 R:R·포지션사이즈를 산출.

---

## 5. 대상 (Market Segment)

엔진의 "사용자"는 사람이 아니라 **다운스트림 소비자**다.

| 소비자 | 읽는 산출물 | 하는 일 |
|---|---|---|
| 웹 (Next.js) | factor_scores·valuations·signals·recommendations·market_regime·sector_rotation·reports | 7메뉴 화면 렌더 |
| 모바일 (Expo) | 위와 동일(anon) | 모바일 화면 렌더 |
| 리포트 생성기 | 위 + financials·flows·disclosures | AI 인뎁스/모닝 브리프 |
| (P3) 봇 워커 | signals·recommendations | 비수탁 자동매매 (보류) |

**제약:** 1인 운영 → 무인·멱등·재시도 필수. 공개 데이터의 지연·결측·차단(네이버 rate limit) 내성. KST 기준 거래일 정합(운영 PC 시간대 무관).

---

## 6. 가치 제안 (Value Proposition)

| 다운스트림의 고통 | 엔진이 주는 것 |
|---|---|
| "화면마다 숫자가 다르다" | 단일 스토어 — 모든 화면이 같은 산출물 read |
| "리포트가 거짓 수치를 지어낸다" | 환각 차단 — 코드 계산값만 주입, 출처 추적 |
| "검증 안 된 신호로 손실" | 백테스트 게이트 — 통과분만 발행 |
| "낡은 종가를 오늘이라며 보여준다" | 신선도 가드 — 미충족 시 발행 중단 |
| "스타일 구분 없이 한 가격" | 스타일별 ATR·레벨 분기(스캘핑~포지션) |

---

## 7. 솔루션 (Solution)

### 7.1 파이프라인 (데이터 흐름)

```
인제스트 → 정규화/적재 → [레짐] → 팩터·밸류에이션 → 백테스트 게이트
   → 시그널(스타일×셋업×세션 + 가격레벨) → 추천(국면 라우팅·점수 상위) → AI 리포트 → 스토어
```

- 레짐을 팩터보다 먼저 — 같은 거래일 레짐으로 팩터 가중을 틸트(point-in-time).
- 신선도 가드가 게이트 직전에 끼어 낡은 데이터 발행을 차단.

### 7.2 모듈 (Key Components)

**A. 인제스트 (`ingest/`)** — `instruments`(유니버스·DART corp_code), `krx`/`kis`(OHLCV·지수·수급·분봉), `dart`(재무·공시), `fred`(매크로), `naver`(환율·지수 폴백), `universe`(시드·분류). 병렬 fetch·재시도·폴백.

**B. 펀더멘털/밸류에이션 (`fundamental/`)** — 재무 정규화(`periods`·연결/별도) → 비율(`ratios`) → DCF(`dcf`) + 상대가치(`relative`) → `valuations`(적정가·upside).

**C. 멀티팩터 (`factors/`)** — Value/Quality/Momentum/Growth/LowVol/Size → 섹터중립 z(`normalize`) → 합성(`compose`) → `factor_scores`(composite_alpha).

**D. 시장/레짐 (`market/regime.py`)** — 2축 분류(방향 score × 추세/횡보 구조, Efficiency Ratio) → uptrend/downtrend/range → `market_regime`. 셋업 라우팅·비중에 연결.

**E. 시그널 (`signals/`)** — 3축 모델(`styles`·`playbooks`·`axes`), 지표(`indicators`), 어닝(`earnings`), 통계/팩터 셋업(`factor_signals`·`generate`), **가격 레벨(`levels`)** = 스타일별 ATR·지지/저항 기반 진입/SL/TP1~3/R:R/포지션사이즈/유효시간 → `signals`. 셋업 라이브러리: 주도주추세·과대낙폭반등·돌파·종가베팅 + 눌림목·52주신고가·변동성수축·PEAD·쌍바닥·기준봉눌림 + 통계군(칼만·시그마·피봇·메디안·델타·마르코프·콴타일·앙상블·소르티노·베이즈) 등.

**F. 백테스트/게이트 (`backtest/`)** — 거래비용(`costs`), 지표(`metrics`: IC·Sharpe·MDD·승률·R:R), 횡단면(`cross_section`: factor_composite IC 검증), 이벤트/장중(`event`·`intraday`), **게이트(`gate`)** = 미통과 셋업 발행 차단·히스테리시스.

**G. 리포트 (`reports/`)** — 컨텍스트 조립(`context`: DB 수치 주입), 프롬프트(`prompts`: 트레이더 렌즈), LLM 호출(`llm`), 렌더(`render`), 일일/모닝 발행(`daily`·`morning`) → `reports`. 수치는 코드, 서술만 LLM, `source_refs` 부착.

**H. 운영 (`cli.py`·`scheduler`·`freshness`·`db_direct`·`timeutil`)** — 상주 워커가 KST morning(08:30)·daily(16:30) 실행, 싱글톤 가드·상태파일 catch-up·재시도. 신선도 가드. 대량 시계열은 직접 PG 스트리밍(REST N+1 회피). 거래일 라벨은 항상 KST.

**I. 보류/후속** — `risk`·`microstructure`·`flow`·`executor`(P3 비수탁 봇, 폐기 방향), `macro` 확장.

### 7.3 기술 (Technology)

- Python 3.12, Typer CLI, httpx, pandas, psycopg(직접 PG), supabase-py.
- 스토어: 클라우드 Supabase(Postgres). 엔진은 service_role로 write.
- 운영: 별도 운영 머신의 상주 워커(상태파일·로그·평일만). 이 레포 워커는 06-18 이후 정지(운영은 다른 머신).
- LLM: Claude (리포트 서술). `ANTHROPIC_API_KEY` 필요.

### 7.4 가정 (Assumptions)

- 공개·저가 데이터만으로 증권사급 산출 품질이 나온다(유료 컨센서스 없이). ⚠️ Phase 0 증명
- 백테스트 게이트가 과적합·미신을 거른다(워크포워드 포함).
- 한국 주식은 거래정지/신규상장이 아니면 매 거래일 봉이 생긴다(신선도 60% 임계의 근거).
- 운영은 한 번에 한 대의 워커만(이중 실행 시 데일리 중복 발행 위험 → 싱글톤 가드).

---

## 8. 릴리스 (Release)

**가동 중 (현재):**
- 인제스트(OHLCV·재무·수급·지수·매크로·공시), 멀티팩터, 밸류에이션, 2축 레짐, 4+ 셋업 + 통계군, ATR 가격레벨, 백테스트 게이트(횡단면·이벤트), 신선도 가드, 일일/모닝 배치 워커.
- AI 리포트 파이프라인 — 코드 완성, **`ANTHROPIC_API_KEY`만 있으면 실가동**.

**다음 (Phase 1 — 트레이더급):**
- 리스크 규율 엔진 강화 — R:R 게이트(≥2)·변동성 포지션사이징·분할·트레일링·계좌 보호.
- 레짐 적응 연결 정교화 — 국면별 셋업 필터·비중 스케일.
- 셋업 확장 + 각 백테스트 게이트.
- 멀티 타임프레임 추세 게이트.
- AI 리포트 "트레이더 렌즈" 프롬프트(청산 시나리오·무효화 트리거) + 뉴스.

**후속 / 보류:**
- 인제스트 신뢰성 — 정기 갱신·실패 알림(sector_rotation 06-09 정지 등 해소).
- 실시간(분봉·틱) 마이크로구조 — 스캘핑/데이 셋업.
- 미국 시장 확장(SEC EDGAR·FMP).
- ❌ (P3) 비수탁 자동매매 봇 — 인가 이슈로 1인 부적합, 보류/폐기.

---

## 부록 A. 산출물 테이블 (스토어 계약)

| 테이블 | 생산 모듈 | 소비자 |
|---|---|---|
| `instruments` | ingest/universe | 전체 |
| `ohlcv` (1d/1m) | ingest/krx·kis | 팩터·시그널·종목상세 |
| `financials` | ingest/dart | 밸류·성장·리포트 |
| `flows` | ingest/kis·naver | 수급축·레짐·종목상세 |
| `macro` | ingest/fred·kis·naver | 시장 화면·레짐 |
| `disclosures` | ingest/dart | 이벤트·알림 |
| `factor_scores` | factors | 5축·추천·스크리너 |
| `valuations` | fundamental | 밸류축·적정가 |
| `market_regime` | market/regime | 시장 화면·추천 라우팅 |
| `sector_rotation` | (집계) | 시장 화면 |
| `signals` | signals | 스크리너·종목상세 |
| `recommendations` | signals/추천 | 추천 화면·픽 배지 |
| `backtests` | backtest | 성과·게이트 근거 |
| `reports` | reports | 리포트 화면 |

## 부록 B. 운영 가드레일

- **신선도 가드** (`freshness.py`): 목표 거래일 봉 보유 < 60% → 발행 중단. 종목별 stale 프레임은 시그널에서 제외.
- **장중 이월 차단** (`timeutil.kr_session_closed`): 장 마감(15:40) 전엔 "오늘" 지수 행 미적재(직전 종가 복제 방지, 2026-06-29 수정).
- **게이트 히스테리시스**: 셋업 통과/탈락이 매일 깜빡이지 않게.
- **싱글톤 워커**: 포트 바인드 가드로 이중 실행 차단(데일리 중복 발행 방지).
- **재시도·catch-up**: 실패 시 같은 날 최대 3회 재시도, PC 재부팅 후에도 당일 1회 보장.

## 부록 C. 열린 질문 / 리스크

- 인제스트 신뢰성이 최대 리스크 — 지연/결측이 발행 품질을 좌우(2026-06-19 사고).
- 운영 머신 단일 의존 — 워커가 한 대에서만 돈다(이 레포 워커는 정지).
- 컨센서스/대체데이터 유료화 시점.
- 실시간 인프라(KIS WS) 도입 시점 — 스캘핑/데이 셋업 전제.
