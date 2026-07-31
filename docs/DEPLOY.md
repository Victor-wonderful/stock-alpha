# 배포 가이드 (DEPLOY.md)

운영 구성: **Vercel(웹) + 호스티드 Supabase(DB) + PC(엔진 배치)**

```
apps/web        → Vercel              (Next.js, 무료 티어 가능)
DB              → 호스티드 Supabase    (ap-northeast-2 Seoul, 관리형 Postgres)
apps/engine     → 이 PC               (작업 스케줄러 크론 유지, 호스티드 DB를 바라봄)
```

> ⚠️ 엔진은 Vercel 불가(상주 파이썬 워커·수 분짜리 배치 필요). 현행 PC 작업 스케줄러 유지.
> ⚠️ Windows webpack `readlink EISDIR`는 D:드라이브 전용 문제 — Vercel(리눅스)에선 발생 안 함.

---

## 단계 0 — 사용자 선행 작업 (계정·프로젝트 생성)

이 두 가지는 로그인이 필요해 사용자가 직접 합니다.

### 0-1. 호스티드 Supabase 프로젝트 생성
1. https://supabase.com/dashboard → **New project**
2. 이름 `stock-alpha`, **Region = Northeast Asia (Seoul) ap-northeast-2**, DB 비밀번호 설정(메모)
3. 생성 후 **Project Settings → API** 에서 다음 4개 확보:
   - Project URL (`https://<ref>.supabase.co`)
   - `anon` public key
   - `service_role` key (비공개)
4. **Project Settings → Database → Connection string** 의 **Direct connection** URI 확보
   (`postgresql://postgres:[PW]@db.<ref>.supabase.co:5432/postgres`)

### 0-2. 값을 로컬 파일에 기입 (채팅에 붙여넣지 말 것 — 시크릿 보호)
`apps/engine/.env.local` 을 호스티드 값으로 갱신:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_DB_URL=postgresql://postgres:[PW]@db.<ref>.supabase.co:5432/postgres
```
(DART/KIS/FRED/ANTHROPIC 키는 그대로 유지)

> 이 파일은 gitignore 됨. 작성 후 "완료"만 알려주면 나머지는 자동 진행.

---

## 단계 1 — 스키마 push (마이그레이션 0001~0020)

```powershell
cd D:\Stock-Alpha
npx supabase link --project-ref <ref>          # DB 비밀번호 입력
npx supabase db push                            # 20개 마이그레이션 적용
```

## 단계 2 — 데이터 이관 (로컬 Docker → 호스티드)

기존 일봉 150만행·재무·수급·시그널·리포트 전부 보존.

```powershell
# 2-1. 로컬 public 스키마 data-only 덤프 (Docker DB에서)
docker exec -e PGPASSWORD=postgres supabase_db_stock-alpha `
  pg_dump -U postgres -d postgres --data-only --schema=public --disable-triggers `
  > D:\Stock-Alpha\.tmp\local_data.sql

# 2-2. 호스티드로 복원 (SUPABASE_DB_URL 사용)
psql "<SUPABASE_DB_URL>" -v ON_ERROR_STOP=1 -f D:\Stock-Alpha\.tmp\local_data.sql
```
> FK 순서 문제는 `--disable-triggers`(data-only)로 회피. 대용량이라 수 분 소요.
> 사용자 소유 테이블(profiles/watchlists 등)은 비어 있어 영향 없음.

## 단계 3 — 엔진 재지정 검증 (PC 유지)

`apps/engine/.env.local` 이 호스티드를 보므로, 한 번 수동 실행해 적재 확인:
```powershell
cd D:\Stock-Alpha\apps\engine
.\.venv\Scripts\python.exe -m engine.cli morning      # 가벼운 배치로 연결 확인
```
작업 스케줄러 태스크(StockAlpha-MorningBatch/DailyBatch/DbBackup)는 그대로 — 같은 .env.local 사용.

## 단계 4 — Vercel 배포

```powershell
cd D:\Stock-Alpha
vercel login
vercel link                      # 기존 또는 새 프로젝트에 연결
```
**Vercel 프로젝트 설정 (대시보드 또는 CLI):**
- **Root Directory** = `apps/web`
- **Include files outside root directory** = ON (← `../../packages/db` 참조 때문에 필수)
- **Framework Preset** = Next.js (자동)
- **Build Command** = 기본(`next build`) — Vercel 리눅스라 turbopack/webpack 둘 다 OK
- **Environment Variables** (Production):
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<anon>`

```powershell
vercel --prod                    # 프로덕션 배포
```

## 단계 5 — 배포 후 점검
- Vercel URL 접속 → 대시보드가 호스티드 DB 데이터로 렌더되는지(코스피·픽·리포트)
- Supabase 대시보드 → Table editor 에서 ohlcv/signals 행수 확인
- 다음 평일 PC 배치가 호스티드 DB에 정상 적재되는지(로그 확인)

---

## 주의 / 함정
- **anon 키는 공개돼도 됨**(RLS 0006·0008로 공개 시장데이터만 read 허용). `service_role`은 절대 클라이언트/Vercel public 노출 금지 — Vercel엔 anon만 넣음.
- 데이터 이관 중 `psql`이 PATH에 없으면 `npx supabase`의 내장 psql 또는 PostgreSQL 클라이언트 설치 필요.
- 무료 티어 Supabase는 1주 미사용 시 일시정지 — PC 배치가 매일 쓰므로 해당 없음.
- **용량/비용 (실측 2026-06-13)**: 현재 DB **385MB** (ohlcv 338MB=88% · flows 19MB · 나머지 ~28MB).
  - Vercel Hobby **$0**.
  - Supabase Free **$0** = 500MB 한도 → **지금은 들어감(77%)** 이나 여유 적음. ohlcv가 일 ~1MB 증가(3,859종목/일) → 수개월 내 한도 도달.
  - 대응: 한도 임박 시 ① **Supabase Pro $25/mo**(8GB) 또는 ② ohlcv 보관기간 축소(백테스트는 600일이면 충분 — 그 이전 봉 롤오프). **런칭은 Free로 시작 가능.**

---

## 자동배포가 멈추는 사고 (2026-06-27 발생 · 07-31 발견)

master 에 머지·푸시했는데도 **한 달 넘게 프로덕션이 갱신되지 않았다.** 코드는 GitHub 에
올라가 있었고(origin/master 동기), Vercel 이 빌드를 안 했다.

**증상** — 화면 문구가 코드와 다르다. 코드에서 지운 라벨("· 실시간 갱신")이 라이브에
그대로 보였다. 프로덕션은 `c8f373a`(6/27)에 고정, master 는 17커밋 앞선 상태였다.

**진단** — 배포 목록에서 `target: "production"` 인 최신 항목의 `githubCommitSha` 를
`git log` 와 대조한다. 커밋이 오래됐으면 자동배포가 죽은 것이다.

```powershell
git rev-list --count <배포된SHA>..master -- apps/web   # 밀린 웹 커밋 수
```

**자동배포 vs 수동배포 구분** — 배포 레코드의 메타로 판별한다. CLI 배포도 로컬 git 정보를
읽어 `githubCommitSha`·`githubCommitRef` 를 붙이므로 커밋 연결만 보면 구분되지 않는다.

| | 자동(웹훅) | 수동(CLI) |
|---|---|---|
| `actor` | 없음 | 있음 (예: `claude-code_*_agent`) |
| `repoPushedAt` · `branchAlias` | 있음 | 없음 |

**우회(즉시 반영)** — repo 루트에서:

```powershell
vercel --prod --yes
```

**근본 복구** — 대시보드 Settings → Git 에서 리포지토리 재연결 / Production Branch(`master`)
/ Ignored Build Step 확인. Vercel API 로는 Git 연동 설정이 보이지 않는다.

**교훈** — 머지 = 라이브 아님. 웹 수정을 반영했다고 말하기 전에 실제 URL 에서 확인할 것.
엔진 쪽에서 같은 부류의 사고가 먼저 있었다(운영 코드가 61커밋 뒤처져 6주간 잘못된 픽 발행).
