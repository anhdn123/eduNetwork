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

rem Mac dinh chi may nay truy cap duoc. De cho may khac trong mang LAN vao: set LBAI_HOST=0.0.0.0
%PY% -m server
pause
