# disable_modern_standby.ps1
# Disable Modern Standby (S0 connected standby) so the resident StockAlpha worker
# is not throttled/suspended by connected standby. This laptop has no usable S3
# (Device Guard) and no hibernate, so disabling Modern Standby leaves NO sleep
# state -> the machine stays in the working state 24/7 (screen may still turn off).
# Root fix replacing the ineffective SetThreadExecutionState(ES_SYSTEM_REQUIRED)
# keep-awake, which does not prevent connected-standby entry on S0-only machines.
# MUST run elevated. Takes effect after a reboot.
# ASCII-only on purpose (system locale CP949 misreads non-ASCII in PS5.1).

$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot '..\logs\ops-power-fix.log'
function W($m) {
    $line = "$(Get-Date -Format o)  $m"
    Write-Output $line
    Add-Content -Path $log -Value $line -Encoding UTF8
}

try {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
    W "=== disable_modern_standby start (elevated=$isAdmin) ==="
    if (-not $isAdmin) { W "ERROR: not elevated - aborting"; exit 5 }

    $key = 'HKLM:\System\CurrentControlSet\Control\Power'
    $before = (Get-ItemProperty $key -Name PlatformAoAcOverride -ErrorAction SilentlyContinue).PlatformAoAcOverride
    if ($null -eq $before) { $before = '(not set)' }
    W "before PlatformAoAcOverride = $before"

    New-ItemProperty -Path $key -Name PlatformAoAcOverride -PropertyType DWord -Value 0 -Force | Out-Null
    $after = (Get-ItemProperty $key -Name PlatformAoAcOverride).PlatformAoAcOverride
    W "after  PlatformAoAcOverride = $after"

    powercfg /change standby-timeout-ac 0 | Out-Null
    powercfg /change standby-timeout-dc 0 | Out-Null
    W "standby-timeout ac/dc set to 0"

    W "DONE - REBOOT REQUIRED for Modern Standby to be disabled"
    exit 0
} catch {
    W "EXCEPTION: $_"
    exit 1
}
