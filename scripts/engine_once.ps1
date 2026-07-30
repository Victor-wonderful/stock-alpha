# engine_once.ps1 - one-shot batch tick for the wake-timer scheduled task.
# Runs `engine.cli worker --once`: evaluates the morning/daily jobs ONCE and runs
# whichever is due (weekday, after its KST time, not done today, attempts<MAX),
# reusing the resident worker's state/retry/freshness logic, then exits. Designed to
# be fired by a WakeToRun task at the KST 08:30 / 16:30 windows (+15min repetition
# for retries). Replaces the always-on resident worker on this Modern-Standby laptop.
# ASCII-only (system locale CP949 misreads non-ASCII in PS5.1).

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'apps\engine')
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$log = Join-Path $root ('logs\wake-once-' + (Get-Date -Format 'yyyyMMdd') + '.log')

# Best-effort keep-awake for the duration of this tick (harmless if S0 ignores it).
try {
    $sig = '[DllImport("kernel32.dll", SetLastError=true)] public static extern uint SetThreadExecutionState(uint f);'
    $p = Add-Type -MemberDefinition $sig -Name PowerReqOnce -Namespace Win32 -PassThru
    $p::SetThreadExecutionState([uint32]"0x80000041") | Out-Null
} catch {}

"=== wake-once START at $(Get-Date -Format o) ===" | Add-Content -Path $log -Encoding UTF8
# NOTE: use Out-File -Encoding utf8, NOT `*>> $log`. In PS 5.1 the `>>` operator writes
# UTF-16LE, which renders every log line as "w o r k e r . s t a r t" and breaks grepping
# for "=== daily ===" / "exit=" when checking a run. $LASTEXITCODE survives the pipe.
& .\.venv\Scripts\python.exe -m engine.cli worker --once *>&1 |
    Out-File -FilePath $log -Append -Encoding utf8
"=== wake-once END exit=$LASTEXITCODE at $(Get-Date -Format o) ===" | Add-Content -Path $log -Encoding UTF8
