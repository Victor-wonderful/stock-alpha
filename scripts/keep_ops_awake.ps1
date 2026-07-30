# keep_ops_awake.ps1
# Belt-and-suspenders for the Modern-Standby-only ops laptop: PlatformAoAcOverride=0
# alone did NOT remove S0 from `powercfg /a` on this firmware, so also remove the
# two triggers that put the machine into connected standby: display-off idle and
# lid close. With these + standby-timeout=0, the machine has no path into DRIPS
# and the resident worker keeps running.
# MUST run elevated. Applies to the active power scheme immediately (no reboot).
# ASCII-only (system locale CP949 misreads non-ASCII in PS5.1).
# Caveat: display stays on 24/7 and lid-close does nothing -> keep the lid OPEN and
# on AC power. Reversible: powercfg /change monitor-timeout-ac 10 ; lid action back to 1.

$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot '..\logs\ops-power-fix.log'
function W($m) {
    $line = "$(Get-Date -Format o)  $m"
    Write-Output $line
    Add-Content -Path $log -Value $line -Encoding UTF8
}

try {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
    W "=== keep_ops_awake start (elevated=$isAdmin) ==="
    if (-not $isAdmin) { W "ERROR: not elevated - aborting"; exit 5 }

    # 1) Display never turns off (removes the idle display-off -> connected standby path)
    powercfg /change monitor-timeout-ac 0 | Out-Null
    powercfg /change monitor-timeout-dc 0 | Out-Null
    W "monitor-timeout ac/dc = 0 (display never off)"

    # 2) Lid close = Do nothing. SUB_BUTTONS / LIDACTION, value 0 = do nothing.
    $SUB_BUTTONS = '4f971e89-eebd-4455-a8de-9e59040e7347'
    $LIDACTION   = '5ca83367-6e45-459f-a27b-476b1d01c936'
    powercfg /setacvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION 0 | Out-Null
    powercfg /setdcvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION 0 | Out-Null
    powercfg /setactive SCHEME_CURRENT | Out-Null
    W "lid close action ac/dc = 0 (do nothing)"

    # 3) Re-assert standby timeouts = 0 (idempotent)
    powercfg /change standby-timeout-ac 0 | Out-Null
    powercfg /change standby-timeout-dc 0 | Out-Null
    W "standby-timeout ac/dc = 0"

    W "DONE - active scheme updated (no reboot needed)"
    exit 0
} catch {
    W "EXCEPTION: $_"
    exit 1
}
