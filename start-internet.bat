@echo off
chcp 65001 >nul
title Kockovi hrdinovia - hra cez internet
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Najprv nainstaluj Node.js z https://nodejs.org ^(verzia LTS^).
  start https://nodejs.org
  pause
  exit /b
)
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Na hru cez internet treba bezplatny program cloudflared.
  echo  Nainstalujem ho teraz cez winget ^(potvrd pripadne okno^)...
  echo.
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  echo.
  echo  Hotovo. ZATVOR toto okno a spusti start-internet.bat ESTE RAZ.
  pause
  exit /b
)
start "Kockovi hrdinovia - server" cmd /k node server.js
timeout /t 2 >nul
start "" http://localhost:3000
echo.
echo  ================================================================
echo   O chvilu sa nizsie objavi adresa v tvare:
echo      https://nieco-nieco.trycloudflare.com
echo   Tuto adresu posli kamaratom - otvoria ju v prehliadaci.
echo   Okno NEZATVARAJ, kym hrate.
echo  ================================================================
echo.
cloudflared tunnel --url http://localhost:3000
pause
