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

# Modern Standby(S0) 대기 금지 — 이 노트북은 S3 미지원이라 idle-timeout=0 으로도
# 연결형 대기(connected standby)에 계속 들어가 백그라운드 워커의 네트워크·CPU 를
# 스로틀/서스펜드한다. 그 결과 20~30분짜리 daily 배치가 여러 날에 걸쳐 끌리며
# 다음 날 16:30 창을 놓쳤다(2026-06-30 daily 누락 장애). SetThreadExecutionState 로
# "이 프로세스가 도는 동안 시스템은 깨어 있어야 함"을 OS 에 지속 요청한다.
# 이 런처 스레드는 while 루프로 워커 생애 내내 살아 있으므로 요청도 계속 유지된다.
$log0 = Join-Path $logDir ("worker-" + (Get-Date -Format "yyyyMMdd") + ".log")
try {
    $sig = '[DllImport("kernel32.dll", SetLastError=true)] public static extern uint SetThreadExecutionState(uint f);'
    $p = Add-Type -MemberDefinition $sig -Name PowerReq -Namespace Win32 -PassThru
    # ES_CONTINUOUS(0x80000000) | ES_SYSTEM_REQUIRED(0x1) | ES_AWAYMODE_REQUIRED(0x40)
    $p::SetThreadExecutionState([uint32]"0x80000041") | Out-Null
    "keep-awake armed (ES_CONTINUOUS|SYSTEM_REQUIRED|AWAYMODE) at $(Get-Date -Format o)" >> $log0
} catch {
    "keep-awake FAILED: $_" >> $log0
}

# 자가치유 — 시작 시 싱글톤 포트(47654)를 쥔 '고아' 워커가 있으면 정리한다.
# (예약작업이 Highest 로 뜨므로 이 런처는 elevated → 이전 워커도 종료 가능.)
# 이렇게 하면 태스크를 재시작하는 것만으로 낡은 워커를 교체할 수 있다. 정상 재기동
# 시에는 이전 python 이 이미 죽어 포트가 비어 있어 아무 것도 죽이지 않는다.
try {
    $stale = (Get-NetTCPConnection -LocalPort 47654 -State Listen -ErrorAction SilentlyContinue).OwningProcess |
        Where-Object { $_ -and $_ -ne $PID } | Select-Object -Unique
    foreach ($sp in $stale) {
        "killing stale worker holding :47654 → PID $sp" >> $log0
        Stop-Process -Id $sp -Force -ErrorAction SilentlyContinue
    }
    if ($stale) { Start-Sleep -Seconds 3 }
} catch { "stale-cleanup FAILED: $_" >> $log0 }

while ($true) {
    $log = Join-Path $logDir ("worker-" + (Get-Date -Format "yyyyMMdd") + ".log")
    "=== worker (re)start at $(Get-Date -Format o) ===" >> $log
    & .\.venv\Scripts\python.exe -m engine.cli worker *>> $log
    "worker exited code=$LASTEXITCODE at $(Get-Date -Format o) — restarting in 10s" >> $log
    Start-Sleep -Seconds 10
}
