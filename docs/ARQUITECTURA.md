# Arquitectura tecnica

## Ciclo de vida MV3

```
Popup / Side Panel (UI efimera)          Service worker (efimero)           Offscreen document (persistente)
  |  start-session(tabId)  ------------>  getMediaStreamId(tab)  ---------->  getUserMedia(tab stream)
  |                                        createDocument(USER_MEDIA)          AudioContext + grafo + detector
  |  <------------- BroadcastChannel "acs-bus" (estado, eventos, fotogramas) ------------------+
  |  pause / resume / finalize / settings --------------- runtime.sendMessage ----------------> SessionController
```

- El **service worker** puede suspenderse: no guarda el motor. Solo coordina el inicio, reenvia `stop` y reacciona a `tabs.onRemoved` (la marca de sesion esta en `chrome.storage.session`).
- El **offscreen document** (razon `USER_MEDIA`, sin `AUDIO_PLAYBACK` para evitar su cierre tras 30 s de silencio) es el unico propietario del stream. Sobrevive al cierre del popup y del side panel.
- Los fotogramas de visualizacion viajan por `BroadcastChannel` (no despierta al service worker) y solo se emiten mientras hay una UI suscrita (latido cada 1,5 s, caduca a los 4 s).
- La pista `ended` (pestana cerrada o captura revocada) finaliza y guarda el segmento en curso.

## Grafo de audio

```
stream -> source -+-> passGain -> destination            (el usuario sigue oyendo la pestana)
                  +-> meter(512) -> destination          (RMS/pico/min/max reales para visualizacion)
                  +-> AnalyserNode (FFT 4096)            (espectrograma)
                  +-> highpass -> lowpass -> meter(1024) (analisis para deteccion, filtros configurables)
                  +-> DelayNode(pre-buffer) -> MediaStreamDestination -> MediaRecorder
```

El **AudioWorklet** (`audio-engine/meter-processor.js`) mide por bloque y usa `currentFrame` como reloj: la deteccion no depende de temporizadores de la pagina.

### Pre-buffer real con MediaRecorder

MediaRecorder no admite "retroceder". El grabador recibe la senal a traves de un `DelayNode` con retardo `D = prebuffer + duracion minima + 60 ms`. Cuando el detector confirma la actividad (instante `t0 + minima`), el grabador arranca y su primera muestra corresponde a `t0 - prebuffer - ...`. Al terminar, se espera `max(0, D - silencio + cola)` para vaciar el retardo y conservar 300 ms de cola. Si el sonido vuelve durante ese vaciado, se continua el mismo segmento.

## Detector (`audio-detector/detector.ts`)

Nivel = `max(RMS, pico - 12 dB)` en dBFS. Estados `idle -> candidate -> active`:

- `idle -> candidate` al superar el umbral de activacion; `candidate -> active` tras la duracion minima sin caer bajo el umbral de silencio.
- `active -> idle` cuando el nivel permanece bajo el umbral de silencio durante `silenceMs`. Pausas mas cortas no cortan.
- Histeresis: umbral de silencio siempre >= 3 dB por debajo del de activacion. Sensibilidad desplaza ambos 0,3 dB/punto. Opcion adaptativa: activacion >= suelo de ruido (aprendido solo en reposo) + 10 dB.

## Almacenamiento

IndexedDB `acs-library` (almacen `recordings`, registros con el `Blob`), compartida por offscreen, popup y side panel (mismo origen). Ajustes en `chrome.storage.local`. Nada se transmite fuera del equipo.

## Servicio multimedia

Ver README. Decision sobre **Native Messaging**: no se adopta porque requiere un manifiesto de host registrado en HKCU con el ID exacto de la extension (que en modo "Cargar descomprimida" depende de la ruta), un binario/BAT lanzado por Chrome por cada conexion y no permite el uso desde otros contextos; el servicio HTTP en loopback con token, `Host`/`Origin` validados y puertos en `config/ports.env` ofrece un nivel de aislamiento adecuado para un servicio opcional.

## Diseno

Referencia: pantalla de aprendizaje de idiomas (lienzo azul palido, superficies blancas con borde fino azulado, azul primario saturado, bloques pastel por categoria, tipografia geometrica redondeada, jerarquia clara con nav lateral resaltada en azul suave). Adaptacion: radios contenidos (3-10 px), sin ilustraciones ni gradientes, pastel reservado a **estados de actividad** (azul esperando, rojo grabando, ambar silencio, violeta procesando, verde completado), visualizaciones en panel oscuro de instrumento en ambos temas. El tema oscuro no es una inversion: superficies azul marino, bordes y estados con luminosidad propia. Tokens en `styles/app.css`.
