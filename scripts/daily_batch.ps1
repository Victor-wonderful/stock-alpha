# Stock-Alpha 일일 EOD 배치 (발행 규정 v1) — 평일 16:30 작업 스케줄러로 실행.
# 파이프라인: 시세 인제스트 → 팩터 → 백테스트 게이트 → 시그널 → 리포트 → 오늘의 포커스
# 로그: logs\daily-YYYYMMDD.log

$ErrorActionPreference = "Continue"
$root = "D:\Stock-Alpha"
$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("daily-" + (Get-Date -Format "yyyyMMdd") + ".log")

Set-Location (Join-Path $root "apps\engine")
& .\.venv\Scripts\python.exe -m engine.cli daily *>> $log
"exit=$LASTEXITCODE at $(Get-Date -Format o)" >> $log

# 분봉 축적 — KIS 는 당일치만 주므로 매일 상위 유동 200종목을 쌓아 이력 확보.
# 데이/스캘핑 백테스트(2단계)의 전제 데이터. 장 마감(15:30 KST) 후 실행.
& .\.venv\Scripts\python.exe -m engine.cli ingest-minutes --top 200 *>> $log
"minutes exit=$LASTEXITCODE at $(Get-Date -Format o)" >> $log
