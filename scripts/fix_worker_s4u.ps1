# StockAlpha-Worker 를 "사용자 로그온 여부와 무관하게 실행"(S4U, Session 0)으로 전환.
# 목적: 워커가 사용자 인터랙티브 세션에 묶여 로그오프/세션종료(0xC000013A) 시 죽던 문제를
#       근본 해결. S4U 는 비밀번호 저장 없이 동작하며, 엔진은 아웃바운드 HTTPS 만 쓰므로
#       Session 0 비대화형 세션에서도 정상 동작한다(네트워크 공유 인증만 불가, 무관).
#
# !! 반드시 관리자 권한 PowerShell 에서 실행 !!
#    (시작 → PowerShell 우클릭 → "관리자 권한으로 실행" → 이 스크립트 경로 실행)
#       powershell -ExecutionPolicy Bypass -File D:\Stock-Alpha\scripts\fix_worker_s4u.ps1
#
# 기존 트리거(로그온 + 데일리 16:00KST)와 설정은 보존하고 Principal 만 교체한다.

$ErrorActionPreference = "Stop"
$TaskName = "StockAlpha-Worker"

# 0) 권한 확인
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "[중단] 관리자 권한이 아닙니다. 관리자 PowerShell 에서 다시 실행하세요." -ForegroundColor Red; exit 1 }

$cs = Get-CimInstance Win32_ComputerSystem
Write-Host "[1/5] Principal 을 S4U(run whether logged on or not) + Highest 로 전환..."
$p = New-ScheduledTaskPrincipal -UserId "$($cs.Name)\VictorAdm" -LogonType S4U -RunLevel Highest
Set-ScheduledTask -TaskName $TaskName -Principal $p | Out-Null
$now = Get-ScheduledTask -TaskName $TaskName
Write-Host ("      적용됨: LogonType={0} RunLevel={1}" -f $now.Principal.LogonType, $now.Principal.RunLevel)

Write-Host "[2/5] 기존 워커/래퍼 정리(싱글톤 포트 해제)..."
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
Get-CimInstance Win32_Process -Filter "Name='python.exe'"     | Where-Object { $_.CommandLine -match 'engine\.cli worker' }        | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'engine_worker\.ps1' }         | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3

Write-Host "[3/5] 작업 시작(이제 Session 0 비대화형으로 기동)..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 15

Write-Host "[4/5] 검증 — 워커 프로세스 + 싱글톤 포트 + 로그..."
$worker = Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -match 'engine\.cli worker' } | Select-Object -First 1
$port   = Get-NetTCPConnection -LocalPort 47654 -ErrorAction SilentlyContinue
Write-Host ("      task State : {0}" -f (Get-ScheduledTask -TaskName $TaskName).State)
Write-Host ("      worker PID : {0}" -f $(if ($worker) { $worker.ProcessId } else { "(없음!)" }))
Write-Host ("      port 47654 : {0}" -f $(if ($port) { "점유 PID " + $port.OwningProcess } else { "(비어있음!)" }))
$log = "D:\Stock-Alpha\logs\worker-" + (Get-Date -Format "yyyyMMdd") + ".log"
if (Test-Path $log) { Write-Host "      --- worker 로그 끝 ---"; Get-Content $log -Tail 4 }

Write-Host "[5/5] 완료. 위 worker PID/포트가 정상이면 S4U 전환 성공."
Write-Host "      이제 로그오프해도 워커가 죽지 않습니다. 검증: 로그오프 후 재로그온 없이"
Write-Host "      08:30/16:30 KST 배치가 도는지(logs\daily-*.log 생성) 확인."
if (-not $worker) {
  Write-Host "[경고] 워커가 안 떴습니다. S4U 세션에서 엔진이 못 뜨는 경우일 수 있습니다." -ForegroundColor Yellow
  Write-Host "       롤백: Principal 을 Interactive/Limited 로 되돌리고 logs\worker-*.log 의 에러를 확인하세요." -ForegroundColor Yellow
}
