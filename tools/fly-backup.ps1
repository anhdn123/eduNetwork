# Sao luu du lieu tu Fly ve may nay (chay moi dem bang Task Scheduler, xem tools\install-fly-backup-task.ps1).
# - Chup CSDL nhat quan (SQLite backup API) + thu muc uploads tren may chu Fly, nen thanh mot tep .tgz, tai ve bang `fly ssh sftp get`.
# - Giu 7 tep, moi tep ung voi mot thu trong tuan (lbai-Mon.tgz ... lbai-Sun.tgz): sang tuan moi tep cung thu bi ghi de.
# - Khong luu mat khau/khoa nao trong tep nay: flyctl dung phien dang nhap san co tren may (fly auth login).
param(
    [string]$App = 'learning-by-ai',
    [string]$Dir = (Join-Path $env:USERPROFILE 'lbai-backups')
)
$ErrorActionPreference = 'Continue'   # flyctl ghi thong bao tien trinh ra stderr; loi that duoc kiem tra bang ma thoat va ket qua
$fly = Join-Path $env:USERPROFILE '.fly\bin\fly.exe'
if (-not (Test-Path $fly)) { $c = Get-Command fly -ErrorAction SilentlyContinue; if ($c) { $fly = $c.Source } else { throw 'Khong tim thay flyctl (fly.exe)' } }
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$log = Join-Path $Dir 'backup.log'
function Log($m) { $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $m; Add-Content -Path $log -Value $line -Encoding UTF8; Write-Host $line }

# Doan Python chay tren may chu Fly (gui qua base64 de khong lo loi dau nhay)
$py = @'
import os, sqlite3, tarfile
d = os.environ.get("LBAI_DATA") or "/data"
out, snap = "/tmp/lbai-backup.tgz", "/tmp/lbai-snap.db"
for p in (snap, out):
    if os.path.exists(p):
        os.remove(p)
src = sqlite3.connect(os.path.join(d, "lbai.db"), timeout=60)
dst = sqlite3.connect(snap)
src.backup(dst)
ok = dst.execute("pragma quick_check").fetchone()[0]
dst.close(); src.close()
with tarfile.open(out, "w:gz", compresslevel=3) as t:
    t.add(snap, "lbai.db")
    u = os.path.join(d, "uploads")
    if os.path.isdir(u):
        t.add(u, "uploads")
os.remove(snap)
print("RESULT", os.path.getsize(out), ok)
'@
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($py))

try {
    Log "Bat dau sao luu $App"
    # Bao dam co mot may dang chay (may tu tat khi khong co nguoi dung)
    $ms = & $fly machines list --app $App --json | ConvertFrom-Json
    if (-not $ms) { throw 'Khong thay may nao cua ung dung' }
    $m = @($ms)[0]
    if ($m.state -ne 'started') { Log "May $($m.id) dang $($m.state), bat len..."; & $fly machine start $m.id --app $App | Out-Null }
    $ready = $false
    for ($i = 0; $i -lt 18 -and -not $ready; $i++) {
        & $fly ssh console --app $App -C 'true' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true } else { Start-Sleep -Seconds 5 }
    }
    if (-not $ready) { throw 'May chu Fly khong san sang sau 90 giay' }

    $res = & $fly ssh console --app $App -C "sh -c 'echo $b64 | base64 -d > /tmp/lbai_bk.py && python /tmp/lbai_bk.py'" 2>&1 | Out-String
    $mt = [regex]::Match($res, 'RESULT (\d+) (\S+)')
    if (-not $mt.Success) { throw "Tao ban sao luu tren may chu that bai: $res" }
    $size = [int64]$mt.Groups[1].Value
    if ($mt.Groups[2].Value -ne 'ok') { throw "CSDL tren may chu bao loi toan ven: $($mt.Groups[2].Value)" }

    $part = Join-Path $Dir 'download.part'
    if (Test-Path $part) { Remove-Item $part -Force }
    & $fly ssh sftp get /tmp/lbai-backup.tgz $part --app $App
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $part)) { throw 'Tai tep ve that bai' }
    $got = (Get-Item $part).Length
    if ($got -ne $size) { Remove-Item $part -Force; throw "Tep tai ve bi thieu ($got / $size byte)" }

    $dest = Join-Path $Dir ('lbai-{0}.tgz' -f (Get-Date).DayOfWeek.ToString().Substring(0, 3))   # lbai-Mon.tgz ... lbai-Sun.tgz
    Move-Item -Path $part -Destination $dest -Force
    & $fly ssh console --app $App -C 'rm -f /tmp/lbai-backup.tgz /tmp/lbai_bk.py' 2>$null | Out-Null
    Log ('Xong: {0} ({1:N1} MB)' -f $dest, ($size / 1MB))
} catch {
    Log "LOI: $($_.Exception.Message)"
    exit 1
}
