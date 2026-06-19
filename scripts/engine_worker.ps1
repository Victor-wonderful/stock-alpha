# Stock-Alpha 상주 워커 — 부팅/로그온 시 작업스케줄러로 1회 기동.
# 내부에서 python worker(KST 스케줄러)를 돌리고, 죽으면 10초 뒤 자동 재기동.
# 작업스케줄러가 부팅 기동·프로세스 사망 시 재시작을 담당하고,
# 이 while 루프가 파이썬 크래시 시 즉시 복구를 담당한다(이중 안전망).
# 로그: logs\worker-YYYYMMDD.log

$ErrorActionPreference = "Continue"
# 리포 루트를 스크립트 위치에서 자동 도출(머신·드라이브 무관) — scripts\ 의 부모가 루트.
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

Set-Location (Join-Path $root "apps\engine")

# UTF-8 강제 — 시스템 로캘이 한국어(CP949)면 로그의 한글·em대시(—) 출력 시
# UnicodeEncodeError 로 워커가 크래시→재기동 루프에 빠진다(2026-06-19 장애). 이 환경변수는
# python 워커와 그 하위배치(morning/daily)까지 상속돼 모든 stdout/파일 출력을 UTF-8 로 만든다.
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

while ($true) {
    $log = Join-Path $logDir ("worker-" + (Get-Date -Format "yyyyMMdd") + ".log")
    "=== worker (re)start at $(Get-Date -Format o) ===" >> $log
    & .\.venv\Scripts\python.exe -m engine.cli worker *>> $log
    "worker exited code=$LASTEXITCODE at $(Get-Date -Format o) — restarting in 10s" >> $log
    Start-Sleep -Seconds 10
}
