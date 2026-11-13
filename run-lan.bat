@echo off
chcp 65001 >nul
cd /d "%~dp0"

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

rem Chay cho CAC MAY KHAC CUNG WIFI/LAN truy cap duoc (khong can Internet).
rem Lan dau Windows se hoi Firewall: chon "Private networks" roi bam "Allow access".
set LBAI_HOST=0.0.0.0
set LBAI_NO_BROWSER=
%PY% -m server
pause
