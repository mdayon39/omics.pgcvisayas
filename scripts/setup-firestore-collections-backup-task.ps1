param(
  [ValidateRange(0, 23)]
  [int]$Hour = 11,
  [ValidateRange(0, 59)]
  [int]$Minute = 0
)

$ErrorActionPreference = "Stop"

$taskName = "PGC Firestore Collections Backup"
$runnerPath = Join-Path $PSScriptRoot "run-firestore-collections-backup.ps1"
$powerShellPath = Join-Path $PSHOME "powershell.exe"
$now = Get-Date
$nextRun = $now.Date.AddHours($Hour).AddMinutes($Minute)
if ($nextRun -le $now) {
  $nextRun = $nextRun.AddDays(1)
}

$action = New-ScheduledTaskAction `
  -Execute $powerShellPath `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $nextRun
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 6)
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Backs up Firestore collections locally every day at the configured time." `
  -Force | Out-Null

Write-Output "Registered '$taskName'."
Write-Output "First run: $($nextRun.ToString('yyyy-MM-dd hh:mm tt'))"
Write-Output "Runs daily at $($nextRun.ToString('hh:mm tt')) while this Windows account is logged in."
Write-Output "Task log: $(Join-Path (Split-Path -Parent $PSScriptRoot) 'backups\firestore-collections-backup-task.log')"
