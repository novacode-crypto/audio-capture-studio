# Estado real de las pruebas

Entorno: Linux (sandbox), Node 20, Chromium 159 de Playwright en modo headless con la extension cargada como descomprimida, audio reproducido por un `<audio>` en una pagina HTTP local y capturado con `chrome.tabCapture`. **No se ha ejecutado nada en Windows** ni con YouTube/servicios reales.

Aviso metodologico: Chromium no permite simular el clic en el icono de la barra en headless, por lo que las pruebas de captura usaron el interruptor de pruebas `--allowlisted-extension-id`. La ruta de produccion (invocacion por clic en el icono / `activeTab`) **no se ha verificado automaticamente**; si se verifico que sin ese interruptor Chromium rechaza la captura aunque haya permiso de host, y el flujo se rediseño en consecuencia.

Senal de prueba: tono senoidal de 440 Hz, rafagas 1,0-2,0 s y 2,4-3,4 s (pausa de 0,4 s) y 7,0-9,0 s.

| # | Prueba | Resultado |
|---|---|---|
| 1 | Musica continua | **Parcial**: tono sintetico continuo. No se probo musica real. |
| 2 | Dialogos | **No probado** con voz real (solo pruebas unitarias del detector con perfiles). |
| 3 | Silencios prolongados | **Correcto** (real y unitario): sin grabacion durante el silencio; 2 segmentos separados por 3,6 s. |
| 4 | Pausas cortas | **Correcto** (real): la pausa de 0,4 s no cortó; el segmento contiene la pausa (silencedetect 1,54-1,95 s). |
| 5 | Volumen bajo | **Unitario**: -48 dB no activa con el perfil general; con sensibilidad +30 si. No probado en Chromium. |
| 6 | Volumen variable | **Unitario**: rampa -70 a -20 dB, inicio al cruzar el umbral (2901 ms, esperado 2880). |
| 7 | Cambio de pestana | **Correcto** (real): captura de la pestana A con otra en primer plano; 2 segmentos grabados. |
| 8 | Cierre del popup | **No probado** como tal (el motor es independiente por diseno; el side panel se abrio como pestana). |
| 9 | Minimizar navegador | **No probado** (headless). |
| 10 | Cierre de la pestana de origen | **Correcto** (real): el segmento en curso se finalizo y guardo (1,54 s). |
| 11 | Detencion manual | **Correcto** (real) en inteligente, manual y continuo. |
| 12 | Exportacion multiformato | **Correcto**: servicio convirtio a mp3, flac, aac, m4a, ogg, opus, webm y wav (cabeceras/ffprobe validos); sobre grabaciones reales de Chromium: mp3, flac, m4a, opus (duraciones 3,24-3,26 s). WAV local desde la UI: descarga completa de 1,04 MB. |
| 13 | Reproduccion de archivos | **Parcial**: validados con ffprobe/ffmpeg (decodificacion correcta). No se escucho ni se probo el reproductor de la biblioteca. |
| 14-16 | Cambio de puertos, inicio con puertos personalizados, puerto ocupado | **Correcto** (Linux, scripts Node): `set` valida rango/duplicados/ocupacion y muestra PID y proceso; `start` con otros puertos escucha en ellos y deja de escuchar en los anteriores; inicio cancelado (codigo 2) con puerto ocupado sin tocar procesos. |
| 17-18 | Parada de servicios propios y reinicio con nueva configuracion | **Correcto** (Linux): `stop` solo detiene el PID registrado; `status` avisa de que hace falta reiniciar tras editar `ports.env`. |
| - | Scripts `.bat` | **No ejecutados** (sin Windows). Se limitan a invocar los scripts Node probados; revisarlos en una maquina Windows antes de uso productivo. |

## Cronometros y pre-buffer (real)

- Segmento 1: 3,25 s; contenido: 0,53 s de silencio previo (pre-buffer 500 ms) y tono completo; cola 0,31 s.
- Segmento 2: 2,86 s; 0,54 s previos; cola 0,33 s. No se perdio el ataque.
- Manual: 3 s + pausa 2 s + 1 s = 4,07 s grabados (la pausa no cuenta).
- Cronometro de audio: suma de segmentos por timestamps, sin avance en silencios del modo inteligente.

## Pruebas automaticas

`npm run test:detector`: 14 comprobaciones (silencio, segmento limpio, pausas cortas/largas, volumen bajo, rampa, transitorio, histeresis, umbral adaptativo).
