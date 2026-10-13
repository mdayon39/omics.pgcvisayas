$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $projectRoot "backups"
$logPath = Join-Path $backupRoot "firestore-collections-backup-task.log"
$backupScript = Join-Path $PSScriptRoot "firestore-backup.js"
$cleanupScript = Join-Path $PSScriptRoot "cleanup-old-backups.js"
$nodeCommand = Get-Command node.exe -ErrorAction Stop

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
Set-Location $projectRoot

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting Firestore collections backup." |
  Add-Content -Path $logPath
& $nodeCommand.Source $backupScript *>> $logPath

if ($LASTEXITCODE -ne 0) {
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup failed with exit code $LASTEXITCODE." |
    Add-Content -Path $logPath
  exit $LASTEXITCODE
}

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup completed successfully." |
  Add-Content -Path $logPath

& $nodeCommand.Source $cleanupScript *>> $logPath
if ($LASTEXITCODE -ne 0) {
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup retention cleanup failed with exit code $LASTEXITCODE." |
    Add-Content -Path $logPath
  exit $LASTEXITCODE
}

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Firestore backup retention cleanup completed." |
  Add-Content -Path $logPath
