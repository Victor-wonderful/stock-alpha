# register_wake_task.ps1 -> register the wake-timer batch task (Modern Standby fix).
#
# Why: this Samsung laptop is Modern-Standby-only (no S3/hibernate) and the always-on
# resident worker gets suspended in connected standby, missing 08:30/16:30 KST batches.
# Instead of staying awake 24/7, schedule discrete WakeToRun ticks at each KST window;
# Modern Standby honors wake timers, so the OS wakes, runs `worker --once`, re-sleeps.
#
# Machine tz is MSK (UTC+3); KST is UTC+9 => KST = MSK + 6. Neither Russia nor Korea
# observes DST, so the +6 offset is stable. Triggers use LOCAL (MSK) time:
#   08:30 KST morning -> 02:30 MSK ;  16:30 KST daily -> 10:30 MSK.
# Each trigger repeats every 15 min for a few hours so a failed tick retries (the
# worker's own attempts<MAX_RETRIES / done_today logic makes repeats idempotent).
#
# Usage (MUST be elevated / Administrator):
#   powershell -ExecutionPolicy Bypass -File <repo>\scripts\register_wake_task.ps1
# ASCII-only on purpose (system locale CP949; PS5.1 misreads non-ASCII no-BOM files).

$ErrorActionPreference = "Stop"
$TaskName = "StockAlpha-WakeBatch"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "[STOP] Not elevated. Run in an Administrator PowerShell." -ForegroundColor Red; exit 1 }

$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "scripts\engine_once.ps1"
if (-not (Test-Path $launcher)) { throw "engine_once.ps1 not found: $launcher" }
$me = "$env:COMPUTERNAME\$env:USERNAME"
Write-Host "[1/4] task=$TaskName user=$me root=$root launcher=$launcher"

# Idempotent re-register.
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "      existing $TaskName -> removing"
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""

# Trigger times are DERIVED from this machine's own timezone, not hardcoded. The ops
# laptop ran MSK (UTC+3) so the windows were 02:30/10:30 local; a Korean desktop (UTC+9)
# needs 08:30/16:30 local for the same KST moments. Hardcoding the laptop offset would
# have started the daily batch before the market closed on any other machine.
# Engine internals already pin KST regardless of PC timezone (cli.py uses a fixed +9),
# so only this OS-level trigger clock needs converting:  local = KST - 9h + local_offset
$offsetH = [TimeZoneInfo]::Local.GetUtcOffset((Get-Date)).TotalHours
function KstToLocal([double]$kstHour) {
    $h = $kstHour - 9 + $offsetH
    while ($h -lt 0) { $h += 24 }
    while ($h -ge 24) { $h -= 24 }
    return [TimeSpan]::FromHours($h).ToString("hh\:mm")
}
$morningAt = KstToLocal 8.5    # KST 08:30 morning brief
$dailyAt   = KstToLocal 16.5   # KST 16:30 daily batch (after 15:30 market close)
Write-Host ("      tz=UTC{0:+0.#;-0.#} -> morning {1} local = 08:30 KST ; daily {2} local = 16:30 KST" -f $offsetH, $morningAt, $dailyAt)

$tMorning = New-ScheduledTaskTrigger -Daily -At $morningAt
$tMorning.Repetition = (New-ScheduledTaskTrigger -Once -At $morningAt `
    -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Hours 3)).Repetition
$tDaily = New-ScheduledTaskTrigger -Daily -At $dailyAt
$tDaily.Repetition = (New-ScheduledTaskTrigger -Once -At $dailyAt `
    -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Hours 6)).Repetition
$triggers = @($tMorning, $tDaily)

# WakeToRun is the whole point. Battery-resilient, catch-up if missed, no overlap.
# ExecutionTimeLimit must exceed the longest batch: daily grew from ~25min to ~3h as
# the backtest stage got heavier, and the old 2h cap killed the tick mid-run every day
# -> success was never recorded -> the next tick re-ran the whole 3h batch (2026-07-29).
# 6h cap + per-command progress in worker_state.json are the two guards against that.
$settings = New-ScheduledTaskSettingsSet `
    -WakeToRun `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6)

$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType S4U -RunLevel Highest
Write-Host "[2/4] principal: S4U + Highest ; WakeToRun=on"

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal `
    -Description "Stock-Alpha wake-timer batch (KST 08:30 morning / 16:30 daily via worker --once)" | Out-Null
Write-Host "[3/4] registered"

$info = Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo
Write-Host ("[4/4] State={0}  NextRun={1}" -f (Get-ScheduledTask -TaskName $TaskName).State, $info.NextRunTime)
Write-Host "      Morning tick ~02:30 MSK (08:30 KST), Daily tick ~10:30 MSK (16:30 KST). WakeToRun on." -ForegroundColor Green
Write-Host "      NOTE: resident StockAlpha-Worker must stay DISABLED to avoid double-publish." -ForegroundColor Yellow
