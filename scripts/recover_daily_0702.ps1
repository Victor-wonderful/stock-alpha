# recover_daily_0702.ps1  (one-shot, run elevated)
# Tonight's daily for 2026-07-02 hung on a network request in the signals/backtest
# stage (no Kernel-Power 507 in the window -> NOT power; a stuck HTTP call, same
# family as the earlier WinError 10054). This takes manual control:
#   1) stop + DISABLE the resident StockAlpha-Worker (also prep for wake-timer migration)
#   2) kill the hung engine python (engine.cli / port 47654 holder)
#   3) re-run `daily --as-of 2026-07-02` to publish today's picks/recommendations
# Writes a .done sentinel with the exit code so a poller can detect completion.
# ASCII-only. Log: logs/daily-recover-0702.log ; audit: logs/ops-power-fix.log

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
$log = Join-Path $logDir 'daily-recover-0702.log'
$sentinel = Join-Path $logDir 'daily-recover-0702.done'
$audit = Join-Path $logDir 'ops-power-fix.log'
Remove-Item $sentinel -ErrorAction SilentlyContinue
function W($m) { $l = "$(Get-Date -Format o)  $m"; Write-Output $l; Add-Content -Path $audit -Value $l -Encoding UTF8 }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
W "=== recover_daily_0702 start (elevated=$isAdmin) ==="
if (-not $isAdmin) { W 'ERROR not elevated'; "exit=5" | Out-File $sentinel -Encoding ascii; exit 5 }

# 1) stop + disable resident worker
try { Stop-ScheduledTask -TaskName StockAlpha-Worker -ErrorAction SilentlyContinue } catch {}
try { Disable-ScheduledTask -TaskName StockAlpha-Worker -ErrorAction SilentlyContinue | Out-Null } catch {}
W 'resident worker: stopped + disabled'
Start-Sleep -Seconds 2

# 2) kill hung engine python (by cmdline engine.cli, and any :47654 holder)
try {
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object { $_.CommandLine -like '*engine.cli*' } |
        ForEach-Object { W "kill engine python PID $($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $holders = (Get-NetTCPConnection -LocalPort 47654 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
    foreach ($h in $holders) { if ($h) { W "kill :47654 holder PID $h"; Stop-Process -Id $h -Force -ErrorAction SilentlyContinue } }
} catch { W "kill step error: $_" }
Start-Sleep -Seconds 3

# 3) run daily for 2026-07-02
Set-Location (Join-Path $root 'apps\engine')
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
W '=== daily --as-of 2026-07-02 START ==='
& .\.venv\Scripts\python.exe -m engine.cli daily --as-of 2026-07-02 *>> $log
$code = $LASTEXITCODE
W "=== daily --as-of 2026-07-02 END exit=$code ==="
"exit=$code" | Out-File $sentinel -Encoding ascii
exit $code
