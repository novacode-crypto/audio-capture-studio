@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AUDIO CAPTURE STUDIO - Diagnostico
echo ============================================================
echo  AUDIO CAPTURE STUDIO - Diagnostico
echo ============================================================
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado. Descarguelo desde https://nodejs.org
  pause
  exit /b 1
)
node scripts\diagnostics.mjs
set RC=%ERRORLEVEL%
echo.
pause
exit /b %RC%
