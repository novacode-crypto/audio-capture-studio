@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title AUDIO CAPTURE STUDIO - Configurar puertos
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado.
  pause
  exit /b 1
)
:menu
cls
echo ============================================================
echo  AUDIO CAPTURE STUDIO - Configuracion de puertos
echo  Archivo unico de configuracion: config\ports.env
echo ============================================================
echo.
node scripts\ports-cli.mjs show
echo.
node scripts\service-ctl.mjs status
echo.
echo  1. Modificar el puerto del servicio multimedia ^(PORT_MULTIMEDIA^)
echo  2. Modificar el puerto de diagnostico ^(PORT_HEALTH^)
echo  3. Restaurar valores predeterminados
echo  4. Comprobar disponibilidad y conflictos
echo  5. Salir
echo.
set "OPC="
set /p OPC=Elija una opcion ^(1-5^): 
if "%OPC%"=="1" call :cambiar PORT_MULTIMEDIA
if "%OPC%"=="2" call :cambiar PORT_HEALTH
if "%OPC%"=="3" call :restaurar
if "%OPC%"=="4" call :comprobar
if "%OPC%"=="5" exit /b 0
goto :menu

:cambiar
set "NUEVO="
set /p NUEVO=Nuevo valor para %1 ^(1024-65535^): 
echo !NUEVO!| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo Valor no valido: escriba solo digitos.
  pause
  exit /b 1
)
node scripts\ports-cli.mjs set %1 !NUEVO!
set RC=!ERRORLEVEL!
if "!RC!"=="2" (
  set "F="
  set /p F=El puerto esta ocupado por otro proceso. Guardar igualmente? ^(S/N^): 
  if /i "!F!"=="S" (
    node scripts\ports-cli.mjs set %1 !NUEVO! --force
    set RC=!ERRORLEVEL!
  )
)
if "!RC!"=="0" call :aplicado
pause
exit /b 0

:restaurar
node scripts\ports-cli.mjs reset
if not errorlevel 1 call :aplicado
pause
exit /b 0

:comprobar
node scripts\ports-cli.mjs validate
pause
exit /b 0

:aplicado
if exist "extension-dist\manifest.json" node scripts\sync-extension-config.mjs
echo.
echo Cambios guardados en config\ports.env.
echo IMPORTANTE: si el servicio esta en ejecucion debe reiniciarlo ^(stop.bat y despues start.bat^).
echo Recargue la extension en chrome://extensions para que lea el nuevo puerto.
exit /b 0
