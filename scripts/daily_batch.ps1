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
