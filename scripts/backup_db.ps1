# Stock-Alpha DB 일일 백업 — 트랙레코드 불변 원칙의 물리적 보장.
# 작업 스케줄러(StockAlpha-DbBackup)가 매일 11:30 MSK(=17:30 KST, 일일 배치 후) 실행.
# 로컬 Supabase(Docker) pg_dump → backups\ 에 압축 보관, 14일 초과분 삭제.

$ErrorActionPreference = "Stop"
$container = "supabase_db_stock-alpha"
$backupDir = "D:\Stock-Alpha\backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$outFile = Join-Path $backupDir "stockalpha-$stamp.sql.gz"

if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

# 컨테이너 내부에서 dump + gzip 후 docker cp 로 복사.
# ⚠️ PowerShell '>' 리다이렉션은 바이너리를 UTF-16 으로 재인코딩해 백업을 망가뜨린다
# (2026-06-12 실측 — \xff\xfe BOM). 반드시 파일 경유로.
docker exec $container sh -c "pg_dump -U postgres -d postgres | gzip > /tmp/sa_backup.sql.gz"
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }
docker cp "${container}:/tmp/sa_backup.sql.gz" $outFile | Out-Null
if ($LASTEXITCODE -ne 0) { throw "docker cp failed (exit $LASTEXITCODE)" }
docker exec $container rm -f /tmp/sa_backup.sql.gz

# 무결성 검증 — gzip 매직바이트(1f 8b)
$head = [System.IO.File]::ReadAllBytes($outFile)[0..1]
if ($head[0] -ne 0x1f -or $head[1] -ne 0x8b) { throw "backup not gzip (corrupt redirection?)" }

$size = (Get-Item $outFile).Length
if ($size -lt 100KB) { throw "backup suspiciously small: $size bytes" }

# 보존 정책: 14일
Get-ChildItem $backupDir -Filter "stockalpha-*.sql.gz" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
  Remove-Item -Force -Confirm:$false

"$(Get-Date -Format s) backup ok: $outFile ($([math]::Round($size/1MB,1)) MB)" |
  Add-Content -Path (Join-Path $backupDir "backup.log")
