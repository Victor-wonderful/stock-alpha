# Stock-Alpha

전문가급 **주식 리서치·시그널·자동매매 플랫폼**. 멀티팩터 퀀트 + 펀더멘털(밸류에이션) + AI 애널리스트 리포트를, 4가지 투자 스타일(스캘핑·데이트레이딩·스윙·포지션)별로 산출한다.

> 분석 → 시그널 → 추천/리포트 → (Phase 3) 비수탁 자동매매가 하나의 데이터 스토어를 공유하는 단일 파이프라인.

## 구성

| 경로 | 역할 | 스택 |
|---|---|---|
| `apps/web` | 프론트 + BFF | Next.js 15 (App Router, TS), Tailwind, shadcn/ui |
| `apps/engine` | 분석·인제스트·리포트·(P3)봇 | Python 3.12+, pandas, Claude API |
| `packages/db` | 스키마 단일 출처 | SQL 마이그레이션 |
| `supabase/` | 로컬 DB/Auth 스택 | Supabase |

## 빠른 시작

```bash
# 1) 환경변수
cp .env.example .env.local        # 값 채우기

# 2) DB (로컬 Supabase)
supabase start
npm run db:migrate

# 3) 웹
npm install
npm run dev                        # http://localhost:3000

# 4) 엔진
cd apps/engine
python -m venv .venv && .\.venv\Scripts\activate    # Windows
pip install -e .
python -m engine.cli --help
```

## 로드맵

- **Phase 1 (MVP)** — 데이터 인제스트 → 분석(팩터·펀더멘털·수급·매크로·마이크로구조) → 스타일별 시그널·추천 → 웹 대시보드/스크리너. (M1–M8)
- **Phase 2** — AI 애널리스트 북 4종 발행 (PDF/DOCX). (M9–M11)
- **Phase 3** — 비수탁 자동매매 봇 (한투 OpenAPI). 별도 상세 플랜.

상세 설계: [docs/PLAN.md](docs/PLAN.md)

## 개발 메모

- **모노레포 링크**: Windows 심링크 권한 이슈로 npm workspaces 링크를 쓰지 않는다. 웹은 `packages/db` 를 `tsconfig` 경로 매핑 + Turbopack `turbopack.root`(모노레포 루트)로 **소스 직접 참조**한다. 각 앱은 자체 `node_modules`.
- **빌드/실행은 Turbopack 사용** (`next dev/build --turbopack`). 웹 앱이 D: 드라이브에 있을 경우 webpack 빌드의 page-data 수집 단계에서 Node `readlink` EISDIR(환경 이슈)이 발생할 수 있어 Turbopack 을 기본으로 한다.

## 면책

본 플랫폼이 제공하는 분석·시그널·투자의견·목표주가는 정보 제공 목적이며 투자 권유가 아니다. 모든 투자 판단과 책임은 사용자 본인에게 있다.
