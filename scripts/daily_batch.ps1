# Stock-Alpha 일일 EOD 배치 (발행 규정 v1) — 평일 16:30 작업 스케줄러로 실행.
# 파이프라인: 시세 인제스트 → 팩터 → 백테스트 게이트 → 시그널 → 리포트 → 오늘의 포커스
# 로그: logs\daily-YYYYMMDD.log

$ErrorActionPreference = "Continue"
# 리포 루트를 스크립트 위치에서 자동 도출(머신·드라이브 무관) — scripts\ 의 부모가 루트.
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("daily-" + (Get-Date -Format "yyyyMMdd") + ".log")

Set-Location (Join-Path $root "apps\engine")

# 분봉 축적을 daily 보다 먼저 — KIS 는 당일치만 주므로 놓치면 영구 손실이다.
# daily 는 실패해도 다음날 재실행으로 복구되지만 분봉은 그날로 끝난다. daily(~2~3시간)
# 뒤에 두면 daily 실패·지연 시 그날 분봉이 통째로 사라진다(2026-06~07 21거래일 손실).
# 데이/스캘핑 백테스트(2단계)의 전제 데이터. 장 마감(15:30 KST) 후 실행.
& .\.venv\Scripts\python.exe -m engine.cli ingest-minutes --top 200 *>> $log
"minutes exit=$LASTEXITCODE at $(Get-Date -Format o)" >> $log

& .\.venv\Scripts\python.exe -m engine.cli daily *>> $log
"exit=$LASTEXITCODE at $(Get-Date -Format o)" >> $log

# 공시 이벤트 축적 — DART 공시목록 분류 적재(이벤트 드리븐 알파 피드).
& .\.venv\Scripts\python.exe -m engine.cli ingest-disclosures --days 3 *>> $log
"disclosures exit=$LASTEXITCODE at $(Get-Date -Format o)" >> $log
