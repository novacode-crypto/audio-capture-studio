# AUDIO CAPTURE STUDIO

Extension Chromium (Manifest V3) para **captura inteligente del audio de una pestana**: detecta el inicio del sonido, graba cada segmento y lo cierra al detectar silencio sostenido, todo en segundo plano. Compatible con Chrome, Microsoft Edge, Brave y otros navegadores Chromium 116 o superior.

- Solo captura la pestana elegida: **sin microfono**, sin otras pestanas, sin telemetria, sin CDN, sin servicios cloud.
- La captura basica **funciona sin el servicio multimedia**. FFmpeg solo es necesario para MP3, FLAC, AAC, M4A, OGG y Opus.

## Contenido

| Carpeta / archivo | Funcion |
|---|---|
| `extension/` | `manifest.json` y paginas HTML (popup, side panel, offscreen) |
| `background/` | Service worker: sesion, permisos, identificadores de captura |
| `offscreen/` | Documento offscreen: motor persistente de captura |
| `audio-engine/` | Grafo Web Audio (AnalyserNode, AudioWorklet, DelayNode) |
| `audio-detector/` | Motor de deteccion de actividad (RMS, pico, histeresis) |
| `recording/` | MediaRecorder y controlador de sesion |
| `visualizers/` | Espectrograma, forma de onda y medidor (Canvas 2D) |
| `popup/`, `sidepanel/`, `components/` | Interfaz React + Tailwind, tooltips, modales y toasts propios |
| `export/` | WAV local, cliente del servicio, descargas |
| `storage/` | Biblioteca en IndexedDB |
| `multimedia-service/` | Servicio Node.js local (FFmpeg/FFprobe) |
| `config/` | `ports.env`, `ports.defaults.env`, `app.env` |
| `fonts/`, `icons/`, `styles/` | Fuentes WOFF2 autohospedadas (Figtree, JetBrains Mono), iconos, sistema de diseno |
| `scripts/` | Utilidades Node usadas por los `.bat` |
| `docs/` | Documentacion tecnica y matriz de pruebas |

## Instalacion

1. Instale **Node.js 18 o superior**.
2. Ejecute `install.bat` (instala dependencias, prepara FFmpeg/FFprobe locales, valida `config\ports.env` y compila la extension en `extension-dist\`). En otros sistemas: `npm install && npm run build:extension`.
3. Abra `chrome://extensions`, active **Modo desarrollador**, pulse **Cargar descomprimida** y seleccione la carpeta `extension-dist`.
4. (Opcional) Ejecute `start.bat` para iniciar el servicio multimedia y copie el **token** que muestra en *Ajustes > Servicio multimedia*.

## Guia de uso

1. **Abra el popup sobre la pestana que quiere capturar** (clic en el icono de la extension). Esa pestana queda preseleccionada.
2. Elija el modo y pulse **Iniciar monitorizacion**. Ya puede cerrar el popup y cambiar a cualquier otra pestana.
3. Abra el **Side Panel** (boton del popup) para ver espectrograma, onda, cronometros, informacion tecnica, ajustes de deteccion y biblioteca.
4. Estados: `ESPERANDO AUDIO` -> `GRABANDO` -> `DETECTANDO SILENCIO` -> `PROCESANDO` -> `COMPLETADO`.

### Modos

- **Inteligente**: escucha continuamente; graba solo con sonido; un archivo por segmento, union de todos (WAV, hasta 20 min) o ambos.
- **Continuo**: graba desde Iniciar hasta Detener, sin cortar por silencio.
- **Manual**: iniciar, pausar, reanudar y finalizar segmento; el analisis visual sigue activo.

### Deteccion

Perfiles Voz / Musica / General / Personalizado. Ajustables: umbral de activacion y de silencio (histeresis, al menos 3 dB de separacion), sensibilidad, duracion minima de actividad, silencio para finalizar (250 ms - 2 s o personalizado), pre-buffer (100 ms - 1 s o personalizado), umbral adaptativo y filtros del analisis. La web `dist/index.html` incluye un analizador que ejecuta el mismo detector sobre un archivo local.

### Exportacion

WAV (local) y original (sin recodificar) siempre disponibles. MP3, FLAC, AAC (ADTS), M4A, OGG, Opus y WebM requieren el servicio; **solo se muestran como disponibles los formatos que el servicio confirma**. Perfiles de calidad Maxima/Alta/Equilibrada/Compacta/Personalizada, frecuencia, canales, ganancia, normalizacion y metadatos opcionales. El original nunca se modifica sin su orden. Nombre por defecto: `nombre-pagina_fecha_hora_segmento.formato`; la opcion *Elegir destino* abre el dialogo de descargas del navegador.

## Puertos: configuracion centralizada

Todos los puertos estan en **un unico archivo**: `config/ports.env`.

```
PORT_MULTIMEDIA=<puerto de la API del servicio>
PORT_HEALTH=<puerto de diagnostico>
```

- **Modificar**: edite el archivo con cualquier editor, o ejecute `configurar-puertos.bat` (consulta, modifica, restaura y comprueba disponibilidad).
- **Comprobar conflictos**: `configurar-puertos.bat` opcion 4, `diagnostics.bat`, o `node scripts/ports-cli.mjs validate`. Si un puerto esta ocupado se muestra PID y nombre del proceso; **nunca se termina un proceso ajeno ni se cambia el puerto en silencio**, y el inicio se cancela.
- **Restaurar**: opcion 3 de `configurar-puertos.bat`. Los valores de fabrica viven solo en `config/ports.defaults.env`, que tambien define las variables obligatorias.
- **Reiniciar tras cambiar**: `stop.bat` y despues `start.bat`. Si el servicio esta en ejecucion con otros puertos, `start.bat`, `diagnostics.bat` y `configurar-puertos.bat` avisan de que hace falta reiniciar.
- **La extension** descubre el endpoint leyendo `service-config.json`, que se genera desde `ports.env` en `build.bat`, `install.bat` y `configurar-puertos.bat`, y se valida (1024-65535, host loopback). Recargue la extension tras cambiar puertos. Hay un campo de puerto manual opcional en Ajustes.
- `config/app.env` contiene parametros generales (host loopback, tamano maximo, caducidad de temporales, rotacion del token, IDs de extension permitidos, rutas propias de FFmpeg) **sin puertos**.

Los scripts `.bat`, los scripts Node, el servicio y la extension no contienen numeros de puerto.

## Servicio multimedia

`multimedia-service/server.mjs` (Node.js, sin dependencias aparte de los binarios `ffmpeg-static` y `ffprobe-static`):

- Escucha solo en `127.0.0.1`; valida cabecera `Host`; solo acepta origenes `chrome-extension://` (opcionalmente restringidos por ID); token Bearer obligatorio (`data/service-token.txt`); limite de tamano; maximo 2 conversiones simultaneas; ficheros temporales caducan y se borran al parar.
- API: `GET /health` (sin datos sensibles), `GET /v1/info`, `POST /v1/convert`, `POST /v1/probe`, `POST /v1/shutdown`.
- **Native Messaging** se evaluo y no se usa: exige registrar un host en el registro de Windows, fijar el ID de la extension y un proceso por conexion; HTTP en loopback con token, validacion de Host/Origin y puertos configurables resulta mas simple y portable para este caso. Ver `docs/ARQUITECTURA.md`.

## Scripts de Windows

`install.bat`, `start.bat`, `stop.bat`, `build.bat`, `diagnostics.bat`, `clean.bat`, `configurar-puertos.bat`. Mensajes en espanol, funcionan desde su propia ubicacion y leen siempre `config/ports.env`. `clean.bat` nunca elimina `ports.env`, `app.env` ni `data/`. `stop.bat` solo detiene el proceso registrado en `runtime/service.pid.json` tras comprobar que es el que escucha en el puerto registrado.

## Limitaciones de Chromium (documentadas, no ocultas)

- **Invocacion**: `chrome.tabCapture` solo permite capturar una pestana despues de invocar la extension en ella (clic en el icono / `activeTab`). Por eso el popup preselecciona la pestana activa. Una vez iniciada la sesion puede cambiar de pestana libremente; si en el selector del Side Panel elige otra pestana que nunca invoco, el navegador rechazara la captura y se le indicara que abra el popup en ella. El permiso de host no sustituye a `activeTab` (verificado).
- **Paginas protegidas**: `chrome://`, `edge://`, `brave://`, tienda de extensiones, `view-source:`, `devtools://` y paginas de otras extensiones no se pueden capturar.
- **Silencio de la pestana**: `tabCapture` silencia la pestana; la extension reenvia el audio al usuario (desactivable en Ajustes).
- **Reinicio del navegador**: la captura no se reanuda sola (requiere gesto del usuario).
- **Duracion MediaRecorder**: los WebM generados por MediaRecorder no declaran duracion en el contenedor; la duracion mostrada es la cronometrada con timestamps. Los formatos convertidos con FFmpeg si la incluyen.
- **Union de segmentos**: se decodifica a PCM en memoria; limite de 20 minutos de audio.
- **Deteccion**: identifica limites perceptibles de actividad segun los parametros configurados, no el primer ni el ultimo bit digital.

## Privacidad y permisos

`tabCapture`, `tabs`, `activeTab`, `storage`, `unlimitedStorage`, `offscreen`, `downloads`, `sidePanel`, `favicon` y acceso a `http://127.0.0.1` / `http://localhost` (servicio local). Sin microfono, sin `<all_urls>`, sin transmision de audio por Internet. CSP de paginas: solo `self` y loopback.

## Desarrollo

```
npm run build:extension     # compila extension-dist/ y valida el manifest MV3
npm run typecheck:extension # TypeScript estricto
npm run test:detector       # pruebas del detector con senales sinteticas
npm run package             # release/AudioCaptureStudio-<version>.zip
```

Mas detalle en `docs/ARQUITECTURA.md` y el estado real de las pruebas en `docs/PRUEBAS.md`.


## Deteccion de FFmpeg y FFprobe

El servicio multimedia, el instalador y `diagnostics.bat` comparten el resolvedor
`scripts/lib/media-binaries.mjs`. La deteccion prioriza las rutas explicitas de
`config/app.env`, despues los binarios locales del proyecto, el `PATH` del sistema
y finalmente los paquetes npm locales.

En Windows, si FFmpeg esta instalado en `D:\ffmpeg\bin` y esa carpeta forma parte
del `PATH`, no es necesario copiar los ejecutables al proyecto ni modificar otras
variables. El diagnostico muestra la version, ruta y origen detectados.

Tambien se pueden fijar rutas concretas en `config/app.env`:

```env
FFMPEG_PATH=D:\ffmpeg\bin\ffmpeg.exe
FFPROBE_PATH=D:\ffmpeg\bin\ffprobe.exe
```

Despues de cambiar la configuracion o actualizar los archivos, reinicia el servicio
con `stop.bat` y `start.bat`.
