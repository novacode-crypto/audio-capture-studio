@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AUDIO CAPTURE STUDIO - Limpieza
echo ============================================================
echo  AUDIO CAPTURE STUDIO - Limpieza de temporales
echo ============================================================
echo Se eliminaran: extension-dist, dist, release, caches y temporales.
echo Se CONSERVAN: config\ports.env, config\app.env, data\ y sus grabaciones.
echo.
set /p OK=Desea continuar? ^(S/N^): 
if /i not "%OK%"=="S" (
  echo Cancelado.
  pause
  exit /b 0
)
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado.
  pause
  exit /b 1
)
node scripts\clean.mjs
echo.
echo Limpieza terminada. Ejecute build.bat para regenerar la extension.
pause
exit /b 0
