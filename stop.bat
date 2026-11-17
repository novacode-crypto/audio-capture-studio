@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AUDIO CAPTURE STUDIO - Detener servicio
echo ============================================================
echo  AUDIO CAPTURE STUDIO - Deteniendo servicio multimedia
echo ============================================================
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado.
  pause
  exit /b 1
)
node scripts\service-ctl.mjs stop
set RC=%ERRORLEVEL%
echo.
echo Solo se detienen procesos propios identificados por runtime\service.pid.json.
pause
exit /b %RC%
