@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AUDIO CAPTURE STUDIO - Servicio multimedia
echo ============================================================
echo  AUDIO CAPTURE STUDIO - Iniciando servicio multimedia
echo ============================================================
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado. Ejecute install.bat.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo [ERROR] Faltan dependencias. Ejecute install.bat.
  pause
  exit /b 1
)
echo Leyendo y validando config\ports.env...
node scripts\service-ctl.mjs start
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (
  echo El servicio queda en segundo plano. Para detenerlo use stop.bat.
  echo Si modifica config\ports.env debe reiniciarlo: stop.bat y despues start.bat.
) else if "%RC%"=="2" (
  echo Inicio cancelado por conflicto de puertos. No se ha modificado ningun proceso.
  echo Cambie los puertos con configurar-puertos.bat o editando config\ports.env.
) else (
  echo El servicio no se pudo iniciar ^(codigo %RC%^).
)
pause
exit /b %RC%
