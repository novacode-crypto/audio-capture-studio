@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AUDIO CAPTURE STUDIO - Compilacion
echo ============================================================
echo  AUDIO CAPTURE STUDIO - Compilacion de produccion
echo ============================================================
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado. Ejecute install.bat.
  goto :fallo
)
echo [1/5] Leyendo y validando config\ports.env...
node scripts\ports-cli.mjs show
if errorlevel 1 goto :fallo
echo.
echo [2/5] TypeScript estricto ^(comprobacion de tipos y variables sin usar^)...
call npx tsc -p tsconfig.extension.json
if errorlevel 1 (
  echo [ERROR] Errores de TypeScript.
  goto :fallo
)
echo     Sin errores.
echo.
echo [3/5] Pruebas del motor de deteccion...
node scripts\test-detector.mjs
if errorlevel 1 (
  echo [ERROR] Fallaron las pruebas del detector.
  goto :fallo
)
echo.
echo [4/5] Generando extension de produccion y validando Manifest V3...
node scripts\build-extension.mjs
if errorlevel 1 (
  echo [ERROR] Fallo la compilacion o la validacion del manifest.
  goto :fallo
)
echo.
echo [5/5] Preparando distribucion ^(ZIP limpio^)...
node scripts\package.mjs
if errorlevel 1 (
  echo [ERROR] Fallo el empaquetado.
  goto :fallo
)
echo.
echo Extension lista en: %~dp0extension-dist
echo Cargue esa carpeta en chrome://extensions ^(Modo desarrollador - Cargar descomprimida^).
pause
exit /b 0
:fallo
echo.
echo La compilacion no se pudo completar.
pause
exit /b 1
