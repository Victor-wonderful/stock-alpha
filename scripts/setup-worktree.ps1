# setup-worktree.ps1
# 새 git worktree(또는 클론)를 로컬 개발 가능 상태로 준비한다.
#
# 이 레포는 Windows 심링크 권한 이슈로 npm workspaces 를 쓰지 않는다(루트 package.json 참조).
# 따라서 워크트리를 새로 만들 때마다 (1) apps/web 의존성 설치, (2) .env.local 복사가 필요하다.
# 이 스크립트는 둘 다 멱등(idempotent)하게 처리한다 — 이미 돼 있으면 건너뛴다.
#
# 사용법 (워크트리 루트에서):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-worktree.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\setup-worktree.ps1 -Force   # node_modules 재설치 강제

param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# --- 경로 결정 -------------------------------------------------------------
# 스크립트 위치 기준으로 현재 워크트리 루트를 잡는다.
$worktreeRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Write-Host "워크트리: $worktreeRoot" -ForegroundColor Cyan

# 메인 레포 루트 = git common dir 의 부모. (.env.local 등 비커밋 시크릿의 출처)
Push-Location $worktreeRoot
try {
    $commonDir = (git rev-parse --git-common-dir).Trim()
} finally {
    Pop-Location
}
if (-not [System.IO.Path]::IsPathRooted($commonDir)) {
    $commonDir = (Resolve-Path (Join-Path $worktreeRoot $commonDir)).Path
}
$mainRepoRoot = (Resolve-Path (Join-Path $commonDir '..')).Path
Write-Host "메인 레포: $mainRepoRoot" -ForegroundColor Cyan

# --- 1. apps/web 의존성 ----------------------------------------------------
$webDir = Join-Path $worktreeRoot 'apps\web'
$webNodeModules = Join-Path $webDir 'node_modules\next'
if ($Force -or -not (Test-Path $webNodeModules)) {
    Write-Host "`n[1/2] apps/web 의존성 설치 중 (npm install)..." -ForegroundColor Yellow
    Push-Location $webDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install 실패 (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    Write-Host "[1/2] 완료." -ForegroundColor Green
} else {
    Write-Host "`n[1/2] apps/web/node_modules 존재 — 건너뜀 (-Force 로 재설치)." -ForegroundColor DarkGray
}

# --- 2. .env.local 복사 ----------------------------------------------------
$targetEnv = Join-Path $webDir '.env.local'
$sourceEnv = Join-Path $mainRepoRoot 'apps\web\.env.local'
if (Test-Path $targetEnv) {
    Write-Host "[2/2] apps/web/.env.local 존재 — 건너뜀." -ForegroundColor DarkGray
} elseif ($worktreeRoot -eq $mainRepoRoot) {
    Write-Host "[2/2] 메인 레포 자체이며 .env.local 이 없습니다. .env.local.example 참고해 직접 생성하세요." -ForegroundColor Red
} elseif (Test-Path $sourceEnv) {
    Copy-Item $sourceEnv $targetEnv
    Write-Host "[2/2] .env.local 복사 완료 (출처: 메인 레포)." -ForegroundColor Green
} else {
    Write-Host "[2/2] 메인 레포에도 .env.local 이 없습니다. apps/web/.env.local.example 참고해 직접 생성하세요." -ForegroundColor Red
}

Write-Host "`n준비 완료. 서버 실행: npm --prefix apps/web run dev" -ForegroundColor Cyan
