param(
  [ValidateRange(0, 23)]
  [int]$Hour = 9,
  [ValidateRange(0, 59)]
  [int]$Minute = 0
)

$ErrorActionPreference = "Stop"

$taskName = "PGC Firebase Storage Backup"
$runnerPath = Join-Path $PSScriptRoot "run-firebase-storage-backup.ps1"
$powerShellPath = Join-Path $PSHOME "powershell.exe"
$scheduledDays = @([DayOfWeek]::Monday, [DayOfWeek]::Wednesday, [DayOfWeek]::Friday)
$now = Get-Date
$nextRun = $null
for ($offset = 0; $offset -lt 7; $offset += 1) {
  $candidate = $now.Date.AddDays($offset).AddHours($Hour).AddMinutes($Minute)
  if ($candidate -gt $now -and $scheduledDays -contains $candidate.DayOfWeek) {
    $nextRun = $candidate
    break
  }
}

$action = New-ScheduledTaskAction `
  -Execute $powerShellPath `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""
$trigger = New-ScheduledTaskTrigger `
  -Weekly `
  -DaysOfWeek Monday,Wednesday,Friday `
  -WeeksInterval 1 `
  -At $nextRun
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
  -Description "Downloads Firebase Storage to local backups every Monday, Wednesday, and Friday; backups older than 30 days are removed after a successful backup." `
  -Force | Out-Null

Write-Output "Registered '$taskName'."
Write-Output "First run: $($nextRun.ToString('yyyy-MM-dd hh:mm tt'))"
Write-Output "Runs Monday, Wednesday, and Friday at $($nextRun.ToString('hh:mm tt')) while this Windows account is logged in."
Write-Output "Task logs: $(Join-Path (Split-Path -Parent $PSScriptRoot) 'backups\firebase-storage-backup-task.log')"
