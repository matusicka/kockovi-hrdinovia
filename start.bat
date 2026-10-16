@echo off
chcp 65001 >nul
title Kockovi hrdinovia - server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Chyba: Nie je nainstalovany Node.js.
  echo  1. Otvor stranku https://nodejs.org
  echo  2. Stiahni verziu "LTS" a nainstaluj ju ^(stale len Dalej / Next^).
  echo  3. Potom znova spusti tento subor start.bat
  echo.
  start https://nodejs.org
  pause
  exit /b
)
start "" http://localhost:3000
node server.js
pause
