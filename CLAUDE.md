# Stock-Alpha — 프로젝트 가이드 (CLAUDE.md)

전문가급 주식 리서치·시그널·자동매매 플랫폼. 멀티팩터 퀀트 + 펀더멘털(밸류에이션) + AI 애널리스트 리포트 + 4스타일(스캘핑/데이트/스윙/포지션) 시그널.

상세 설계는 `docs/PLAN.md` 참조.

## 아키텍처 원칙

- **단일 공유 데이터 스토어**: 모든 엔진은 Supabase Postgres 하나를 공유한다. 분석 엔진이 `factor_scores`/`valuations`/`signals`/`recommendations`에 write → 웹·리포트 생성기·(P3) 봇 워커가 read.
- **투자 스타일은 1급 차원**: `signals`/`recommendations`/`backtests`에 `style`(scalping/day/swing/position) 태그. 같은 종목도 스타일별로 다른 진입/TP/SL.
- **시그널 품질 게이트**: 백테스트(IC·Sharpe·MDD·승률·R:R·워크포워드) 미통과 시그널은 발행 금지.
- **리포트 환각 차단**: 모든 수치는 코드(파이썬)가 계산해 LLM에 주입. LLM은 서술만. 수치는 `source_refs`로 DB 근거 추적.
- **비수탁 원칙(P3)**: 자금 미보유. 출금 권한 없는 키만, KMS 암호화, 워커에서만 복호화. 평문 키 클라이언트 노출 금지.

## 모노레포 레이아웃

- `apps/web` — Next.js 15 App Router (TS). 프론트 + BFF API routes.
- `apps/engine` — Python. 분석·인제스트·리포트·(P3)봇 워커.
- `packages/db` — SQL 마이그레이션 + 공유 타입 (스키마 단일 출처).
- `supabase/` — Supabase 로컬 설정.

## 코딩 규약

- **언어**: 웹/BFF = TypeScript, 분석/워커 = Python 3.12+.
- **DB 스키마는 `packages/db`가 단일 출처**. 스키마 변경은 마이그레이션 파일 추가로만.
- **시크릿은 절대 커밋 금지**. `.env.example`만 갱신. `SUPABASE_SERVICE_ROLE_KEY`·broker 키는 서버/워커 전용.
- **RLS 필수**: 사용자 소유 테이블(profiles, watchlists, alerts, broker_credentials, bot_configs, executions, positions)은 `user_id = auth.uid()`.
- **재현성**: 모든 분석 산출물에 `source_version` 기록.

## 자주 쓰는 명령

```bash
# 웹
npm run dev                    # Next.js 개발 서버
npm run build

# DB (Supabase CLI)
supabase start                 # 로컬 스택
npm run db:migrate             # 마이그레이션 적용

# 엔진 (apps/engine)
python -m engine.cli --help    # 워커 CLI
pytest apps/engine             # 테스트
```

## 컨벤션 주의

- 미국/국내 회계연도·통화 혼재 → `financials`는 정규화 후 저장(fs_type: 연결/별도 구분).
- 실시간 `ticks`/`orderbook`은 핫스토리지(TTL/롤업). 장기 보관은 분/일봉 `ohlcv`로.
- 가격 레벨(진입/TP/SL)은 `engine/signals/levels`에서 스타일별 ATR·지지저항 기반 산출. ATR 배수는 백테스트로 캘리브레이션.
