# Stock-Alpha resident worker -> register as a Scheduled Task (machine/account agnostic).
#
# What it does: on logon/startup it launches engine_worker.ps1 once; that wrapper runs
#   the python worker (KST scheduler) and auto-restarts it on crash. The worker itself
#   uses a 127.0.0.1:47654 singleton guard to prevent double execution.
#
# Usage (MUST be an elevated / Administrator PowerShell):
#   powershell -ExecutionPolicy Bypass -File <repo>\scripts\register_worker_task.ps1
#   Add -S4U for logoff resilience (run whether logged on or not, Session 0).
#
# ASCII-only on purpose: the system locale is Korean (CP949) and PowerShell 5.1 misreads
# UTF-8 (no BOM) files, which can corrupt parsing. Keep this file ASCII.

param(
    [switch]$S4U   # Session 0 (survives logoff). Requires admin (same as plain register).
)

$ErrorActionPreference = "Stop"
$TaskName = "StockAlpha-Worker"

# Registering a scheduled task requires elevation on this machine. Gate up front.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[STOP] Not elevated. Re-run in an Administrator PowerShell:" -ForegroundColor Red
    Write-Host "       Start menu -> Windows PowerShell -> right click -> 'Run as administrator'" -ForegroundColor Red
    Write-Host "       then: powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"$(if($S4U){' -S4U'})" -ForegroundColor Yellow
    exit 1
}

# Derive repo root and wrapper path from this script's own location.
$root = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $root "scripts\engine_worker.ps1"
if (-not (Test-Path $wrapper)) { throw "engine_worker.ps1 not found: $wrapper" }

$me = "$env:COMPUTERNAME\$env:USERNAME"
Write-Host "[1/4] target: task=$TaskName  user=$me  root=$root  S4U=$S4U"

# Remove any existing task (idempotent re-register).
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "      existing $TaskName found -> removing for clean re-register"
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$wrapper`""

# Triggers: at logon + at startup. (Startup only takes effect with S4U.) StartWhenAvailable = catch-up.
$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn),
    (New-ScheduledTaskTrigger -AtStartup)
)

# Laptop-critical: start/keep running on battery (default would stop on battery). Resident -> no time limit.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

if ($S4U) {
    $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType S4U -RunLevel Highest
    Write-Host "[2/4] principal: S4U (survives logoff) + Highest"
} else {
    $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
    Write-Host "[2/4] principal: Interactive (runs while logged on). Use -S4U for logoff resilience."
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal `
    -Description "Stock-Alpha resident engine worker (KST 08:30 morning / 16:30 daily)" | Out-Null
Write-Host "[3/4] registered -> starting now"

# Remove the logon Startup shortcut if present: the task now owns startup, and keeping the
# shortcut would spawn a second wrapper that spin-retries every 10s against the singleton port.
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) "StockAlpha-Worker.lnk"
if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host "      removed redundant Startup shortcut: $lnk" }

# Stop any worker already running so the scheduled task owns the singleton port.
Get-CimInstance Win32_Process -Filter "Name='python.exe'"     | Where-Object { $_.CommandLine -match 'engine\.cli worker' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'engine_worker\.ps1' }  | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 14

# Verify: one process holds the singleton port.
$worker = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -match 'engine\.cli worker' } | Select-Object -First 1
$port = Get-NetTCPConnection -LocalPort 47654 -ErrorAction SilentlyContinue
Write-Host ("[4/4] task State : {0}" -f (Get-ScheduledTask -TaskName $TaskName).State)
Write-Host ("      worker PID : {0}" -f $(if ($worker) { $worker.ProcessId } else { "(none!)" }))
Write-Host ("      port 47654 : {0}" -f $(if ($port) { "held by PID " + ($port.OwningProcess -join ',') } else { "(empty!)" }))
if ($worker -and $port) {
    Write-Host "      OK - worker running. Weekday 08:30/16:30 KST batches will run automatically." -ForegroundColor Green
    if ($S4U) { Write-Host "      S4U active: worker survives logoff. Verify by logging off then checking logs\daily-*.log." -ForegroundColor Green }
} else {
    Write-Host "      WARNING - worker not running. Check logs\worker-*.log" -ForegroundColor Yellow
}
