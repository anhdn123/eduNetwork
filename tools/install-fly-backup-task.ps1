# Tao tac vu theo lich cua Windows: moi ngay luc 23:30 chay tools\fly-backup.ps1 (sao luu Fly ve may nay).
# Chay mot lan:  powershell -ExecutionPolicy Bypass -File tools\install-fly-backup-task.ps1
# - Chay duoi tai khoan cua ban, khong can quyen quan tri.
# - Neu may tat luc 23:30, tac vu se chay ngay khi may bat lai (StartWhenAvailable).
# Go bo:  Unregister-ScheduledTask -TaskName 'LBAI Fly Backup' -Confirm:$false
param([string]$Time = '23:30')
$script = Join-Path $PSScriptRoot 'fly-backup.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script)
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'LBAI Fly Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Sao luu du lieu Learning by AI tu Fly ve may nay moi dem' -Force | Out-Null
Write-Host "Da tao tac vu 'LBAI Fly Backup' chay moi ngay luc $Time. Ban sao luu nam o $env:USERPROFILE\lbai-backups"
