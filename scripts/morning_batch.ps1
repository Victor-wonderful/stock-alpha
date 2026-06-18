# Stock-Alpha 모닝 배치 — 평일 08:30 작업 스케줄러로 실행.
# 파이프라인: FRED 매크로 갱신 → 시장 레짐 → 모닝 브리프 발행 (픽은 전일 16:30분 유효)
# 로그: logs\morning-YYYYMMDD.log

$ErrorActionPreference = "Continue"
# 리포 루트를 스크립트 위치에서 자동 도출(머신·드라이브 무관) — scripts\ 의 부모가 루트.
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("morning-" + (Get-Date -Format "yyyyMMdd") + ".log")

Set-Location (Join-Path $root "apps\engine")
& .\.venv\Scripts\python.exe -m engine.cli morning *>> $log
"exit=$LASTEXITCODE at $(Get-Date -Format o)" >> $log
