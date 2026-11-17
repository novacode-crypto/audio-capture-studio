@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AUDIO CAPTURE STUDIO - Instalacion
echo ============================================================
echo  AUDIO CAPTURE STUDIO - Instalacion
echo ============================================================
echo.
echo [1/7] Comprobando Node.js y npm...
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado. Descarguelo desde https://nodejs.org ^(version 18 o superior^) y vuelva a ejecutar este script.
  goto :fallo
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm no esta disponible. Reinstale Node.js.
  goto :fallo
)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
if errorlevel 1 (
  echo [ERROR] Se requiere Node.js 18 o superior.
  node -v
  goto :fallo
)
for /f "delims=" %%v in ('node -v') do echo     Node.js %%v
for /f "delims=" %%v in ('npm -v') do echo     npm %%v
echo.
echo [2/7] Instalando dependencias ^(puede tardar unos minutos^)...
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo [ERROR] Fallo la instalacion de dependencias. Revise su conexion a Internet.
  goto :fallo
)
echo.
echo [3/7] Preparando FFmpeg y FFprobe locales...
node scripts\setup-ffmpeg.mjs
if errorlevel 1 echo [AVISO] FFmpeg/FFprobe no estan listos. La captura funcionara; la conversion avanzada no.
echo.
echo [4/7] Configuracion del servicio local ^(config\ports.env y config\app.env^)...
if not exist "config\ports.env" (
  copy /y "config\ports.defaults.env" "config\ports.env" >nul
  echo     Se creo config\ports.env con los valores predeterminados.
)
if not exist "data" mkdir "data"
if not exist "runtime" mkdir "runtime"
echo.
echo [5/7] Native Messaging: no se utiliza ^(la extension se comunica con el servicio por localhost con token^).
echo.
echo [6/7] Leyendo y validando puertos...
node scripts\ports-cli.mjs validate
if errorlevel 2 (
  echo [AVISO] Hay puertos ocupados. Use configurar-puertos.bat para cambiarlos antes de ejecutar start.bat.
) else if errorlevel 1 (
  echo [ERROR] ports.env no es valido. Use configurar-puertos.bat.
  goto :fallo
)
echo.
echo [7/7] Compilando la extension y verificando la instalacion...
call npm run build:extension
if errorlevel 1 (
  echo [ERROR] Fallo la compilacion de la extension.
  goto :fallo
)
node scripts\diagnostics.mjs
echo.
echo ============================================================
echo  Instalacion terminada.
echo  1. Ejecute start.bat para iniciar el servicio multimedia ^(opcional^).
echo  2. En chrome://extensions active el Modo desarrollador,
echo     pulse "Cargar descomprimida" y elija la carpeta extension-dist.
echo ============================================================
pause
exit /b 0
:fallo
echo.
echo La instalacion no se pudo completar.
pause
exit /b 1
