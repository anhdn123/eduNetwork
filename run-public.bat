@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ===== Chay may chu NGAY TREN MAY NAY va dua ra Internet qua Cloudflare Quick Tunnel (mien phi, khong gioi han bang thong Render) =====
rem Dung khi Render bi khoa vi het bang thong. May nay phai bat va chay file nay trong luc hoc sinh dung. Duong dan (https://xxxx.trycloudflare.com)
rem hien trong cua so "cloudflared" va DOI MOI LAN CHAY - gui duong dan moi cho hoc sinh.
rem Can: Python va cloudflared (tai ban cho Windows tai https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ )

where python >nul 2>nul
if %errorlevel%==0 (
    set PY=python
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        set PY=py
    ) else (
        echo Khong tim thay Python. Hay cai Python tai https://www.python.org/downloads/
        pause
        exit /b 1
    )
)
where cloudflared >nul 2>nul
if not %errorlevel%==0 (
    echo Khong tim thay cloudflared. Tai tai: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    echo Sau khi cai, mo lai file nay.
    pause
    exit /b 1
)

rem Du lieu rieng cho cach chay nay (tach khoi thu muc data cua ban lap trinh). Lan dau, neu da dat bien sao luu (LBAI_BACKUP_URL va LBAI_BACKUP_KEY)
rem he thong tu khoi phuc du lieu tu ban sao luu. CHI MOT noi duoc ghi vao kho sao luu: truoc khi Render chay lai, hay TAT may chu nay.
if "%LBAI_DATA%"=="" set LBAI_DATA=%USERPROFILE%\lbai-data
set LBAI_HOST=127.0.0.1
set LBAI_PORT=5500
set LBAI_NO_BROWSER=1
set LBAI_COOKIE_SECURE=1
set LBAI_TRUST_PROXY=1

start "LBAI server" cmd /k "%PY% -m server"
echo Dang cho may chu khoi dong...
timeout /t 6 /nobreak >nul
echo Dang mo duong ham Internet. Tim dong co chu trycloudflare.com ben duoi.
cloudflared tunnel --url http://localhost:5500
pause
