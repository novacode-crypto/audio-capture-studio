import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, Download, FolderCog, Gauge, HardDrive, Layers, Lock, Radio, ShieldCheck, SlidersHorizontal, Terminal, Upload, Waves, FileAudio, TriangleAlert, Wand2,
} from "lucide-react";
import { ActivityDetector } from "../audio-detector/detector";
import { PROFILES } from "../shared/profiles";

/* ------------------------------------------------------------------ */
/* Analizador: ejecuta el MISMO motor de deteccion de la extension     */
/* sobre un archivo de audio local (nada sale del navegador).          */
/* ------------------------------------------------------------------ */
const BLOCK = 1024;
interface Frames { rms: Float32Array; peak: Float32Array; cols: Float32Array; sr: number; durMs: number; name: string }
interface Seg { startMs: number; endMs: number }

const db = (v: number) => (v <= 1e-6 ? -120 : 20 * Math.log10(v));

function analyzeBuffer(buf: AudioBuffer, name: string): Frames {
  const n = Math.floor(buf.length / BLOCK);
  const rms = new Float32Array(n);
  const peak = new Float32Array(n);
  const cols = new Float32Array(n * 2);
  const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    let best = 0, pk = 0, mn = 0, mx = 0;
    for (const d of chs) {
      let s = 0;
      for (let j = 0; j < BLOCK; j++) {
        const v = d[i * BLOCK + j];
        s += v * v;
        const a = Math.abs(v);
        if (a > pk) pk = a;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      best = Math.max(best, s);
    }
    rms[i] = Math.sqrt(best / BLOCK);
    peak[i] = pk;
    cols[i * 2] = mn;
    cols[i * 2 + 1] = mx;
  }
  return { rms, peak, cols, sr: buf.sampleRate, durMs: (buf.length / buf.sampleRate) * 1000, name };
}

function synthBuffer(): AudioBuffer {
  const sr = 48000;
  const ctx = new OfflineAudioContext(1, sr * 14, sr);
  const buf = ctx.createBuffer(1, sr * 14, sr);
  const d = buf.getChannelData(0);
  const bursts: [number, number, number][] = [[1, 2.2, 0.3], [2.6, 3.8, 0.25], [7, 9.5, 0.2], [11.2, 11.6, 0.35]];
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    for (const [a, b, amp] of bursts) if (t >= a && t < b) d[i] = amp * Math.sin(2 * Math.PI * (t < 5 ? 330 : 520) * t);
  }
  return buf;
}

function detect(f: Frames, cfg: { onDb: number; offDb: number; sensitivity: number; minActivityMs: number; silenceMs: number }, preMs: number): Seg[] {
  const det = new ActivityDetector({ ...cfg, adaptive: false });
  const segs: Seg[] = [];
  let open: number | null = null;
  for (let i = 0; i < f.rms.length; i++) {
    const t = ((i + 1) * BLOCK / f.sr) * 1000;
    const ev = det.push(t, db(f.rms[i]), db(f.peak[i]));
    if (ev?.type === "start") open = Math.max(0, ev.onsetMs - preMs);
    if (ev?.type === "end" && open !== null) {
      segs.push({ startMs: open, endMs: Math.min(f.durMs, ev.lastSoundMs + Math.min(300, ev.atMs - ev.lastSoundMs)) });
      open = null;
    }
  }
  if (open !== null) segs.push({ startMs: open, endMs: f.durMs });
  return segs;
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${(ms / 1000 % 60).toFixed(1).padStart(4, "0")}`;

function Playground() {
  const [frames, setFrames] = useState<Frames | null>(null);
  const [profile, setProfile] = useState<keyof typeof PROFILES>("general");
  const [sens, setSens] = useState(50);
  const [silence, setSilence] = useState<number>(PROFILES.general.silenceMs);
  const [pre, setPre] = useState<number>(PROFILES.general.prebufferMs);
  const [err, setErr] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const p = PROFILES[profile];

  const segs = useMemo(
    () => (frames ? detect(frames, { onDb: p.onDb, offDb: p.offDb, sensitivity: sens, minActivityMs: p.minActivityMs, silenceMs: silence }, pre) : []),
    [frames, p, sens, silence, pre],
  );

  const load = async (file: File) => {
    setErr(null);
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      void ctx.close();
      setFrames(analyzeBuffer(buf, file.name));
    } catch {
      setErr("No se pudo decodificar el archivo. Pruebe con WAV, MP3, OGG, M4A o WebM.");
    }
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !frames) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (c.width = c.clientWidth * dpr);
    const H = (c.height = 140 * dpr);
    const g = c.getContext("2d")!;
    g.fillStyle = "#0d1b36";
    g.fillRect(0, 0, W, H);
    const n = frames.rms.length;
    const x = (ms: number) => (ms / frames.durMs) * W;
    g.fillStyle = "rgba(224,62,69,0.22)";
    for (const s of segs) g.fillRect(x(s.startMs), 0, Math.max(1, x(s.endMs) - x(s.startMs)), H);
    const mid = H / 2;
    g.fillStyle = "#6fb0ff";
    const step = Math.max(1, Math.floor(n / W));
    for (let px = 0; px < W; px++) {
      const i0 = Math.floor((px / W) * n);
      let mn = 0, mx = 0;
      for (let k = 0; k < step; k++) {
        mn = Math.min(mn, frames.cols[(i0 + k) * 2] ?? 0);
        mx = Math.max(mx, frames.cols[(i0 + k) * 2 + 1] ?? 0);
      }
      const comp = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v));
      g.fillRect(px, mid - comp(mx) * (mid - 4), 1, Math.max(1, (comp(mx) - comp(mn)) * (mid - 4)));
    }
  }, [frames, segs]);

  const chip = (on: boolean) => `rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${on ? "border-brand bg-brands text-brand" : "border-edge bg-paper text-ink2 hover:bg-wash"}`;
  const total = segs.reduce((n, s) => n + (s.endMs - s.startMs), 0);

  return (
    <div className="rounded-lg border border-edge bg-paper p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand2">
          <Upload size={16} /> Analizar un archivo de audio
          <input type="file" accept="audio/*,video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
        </label>
        <button type="button" onClick={() => setFrames(analyzeBuffer(synthBuffer(), "senal-sintetica (tonos)"))} className="inline-flex items-center gap-2 rounded-md border border-edge2 bg-paper px-3.5 py-2 text-sm font-semibold hover:bg-wash">
          <Wand2 size={16} /> Usar senal de prueba sintetica
        </button>
        <span className="text-sm text-ink3">El archivo se procesa en su navegador y no se envia a ningun sitio.</span>
      </div>
      {err ? <p className="mt-3 text-sm text-rec">{err}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <div>
          <div className="mb-1 text-sm font-semibold">Perfil</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(PROFILES) as (keyof typeof PROFILES)[]).map((k) => (
              <button key={k} type="button" className={chip(profile === k)} onClick={() => { setProfile(k); setSilence(PROFILES[k].silenceMs); setPre(PROFILES[k].prebufferMs); }}>{PROFILES[k].label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 flex justify-between text-sm font-semibold" htmlFor="sens">Sensibilidad <span className="num text-brand">{sens - 50 >= 0 ? "+" : ""}{sens - 50}</span></label>
          <input id="sens" type="range" min={0} max={100} value={sens} onChange={(e) => setSens(Number(e.target.value))} className="w-full accent-[#1f6feb]" />
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Silencio para finalizar</div>
          <div className="flex flex-wrap gap-1.5">{[500, 1000, 2000].map((v) => <button key={v} type="button" className={chip(silence === v)} onClick={() => setSilence(v)}>{v / 1000} s</button>)}</div>
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Pre-buffer</div>
          <div className="flex flex-wrap gap-1.5">{[100, 250, 500, 1000].map((v) => <button key={v} type="button" className={chip(pre === v)} onClick={() => setPre(v)}>{v} ms</button>)}</div>
        </div>
      </div>
      {frames ? (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{frames.name}</span>
            <span className="num text-ink2">{fmt(frames.durMs)} totales - {segs.length} segmento(s) - {fmt(total)} con sonido</span>
          </div>
          <canvas ref={canvas} className="block h-[140px] w-full rounded-md" aria-label="Forma de onda del archivo con los segmentos detectados sombreados" role="img" />
          <ul className="num mt-3 grid gap-1 text-sm text-ink2 sm:grid-cols-2">
            {segs.map((s, i) => <li key={i} className="rounded-sm bg-wash px-2 py-1">Segmento {i + 1}: {fmt(s.startMs)} - {fmt(s.endMs)} ({((s.endMs - s.startMs) / 1000).toFixed(1)} s)</li>)}
            {!segs.length ? <li className="rounded-sm bg-ambers px-2 py-1 text-amber">Sin actividad con estos umbrales. Suba la sensibilidad.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const STATES = [
  { n: "Esperando audio", c: "bg-brands text-brand" },
  { n: "Grabando", c: "bg-recs text-rec" },
  { n: "Detectando silencio", c: "bg-ambers text-amber" },
  { n: "Procesando", c: "bg-violets text-violet" },
  { n: "Completado", c: "bg-oks text-ok" },
];

const FEATURES = [
  { i: Radio, t: "Captura en segundo plano", d: "Motor en un documento offscreen: sigue grabando solo la pestana elegida aunque cambie de pestana, cierre el popup o minimice el navegador." },
  { i: SlidersHorizontal, t: "Deteccion real con histeresis", d: "RMS y pico por bloque en el reloj de audio, umbrales de activacion y silencio diferenciados, duracion minima y silencio sostenido." },
  { i: Waves, t: "Pre-buffer sin perder el ataque", d: "Un retardo en el grafo de Web Audio recupera el sonido previo al disparo: 100 ms, 250 ms, 500 ms, 1 s o personalizado." },
  { i: AudioLines, t: "Espectrograma y forma de onda", d: "FFT de 4096 puntos y envolvente de muestras reales en Canvas 2D, con zoom de frecuencia, escala log/lineal y sensibilidad visual." },
  { i: FileAudio, t: "Exportacion multiformato", d: "WAV y original sin servicio. MP3, FLAC, AAC, M4A, OGG y Opus con FFmpeg local, solo los que el servicio confirma." },
  { i: HardDrive, t: "Biblioteca local", d: "IndexedDB: reproducir, renombrar, convertir, ver metadatos, limpiar. Ninguna grabacion sale de su equipo." },
];

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-edge bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white"><AudioLines size={18} /></div>
          <span className="text-lg font-bold tracking-tight">AUDIO CAPTURE STUDIO</span>
          <nav className="ml-auto hidden gap-5 text-sm font-medium text-ink2 md:flex">
            <a href="#probar" className="hover:text-brand">Probar</a><a href="#instalar" className="hover:text-brand">Instalar</a><a href="#puertos" className="hover:text-brand">Puertos</a><a href="#limites" className="hover:text-brand">Limitaciones</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16">
        <section className="grid items-center gap-8 py-14 md:grid-cols-[1.15fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-brands px-2 py-1 text-xs font-bold uppercase tracking-wider text-brand"><ShieldCheck size={13} /> Extension Chromium Manifest V3</span>
            <h1 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-tight">Graba solo cuando <span className="text-brand">suena</span>.</h1>
            <p className="mt-4 max-w-xl text-lg text-ink2">Seleccione una pestana, active la monitorizacion y siga trabajando. La extension detecta el inicio del sonido, graba cada segmento y lo cierra al detectar silencio sostenido. Sin microfono, sin nube, sin telemetria.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {STATES.map((s) => <span key={s.n} className={`rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide ${s.c}`}>{s.n}</span>)}
            </div>
          </div>
          <div className="rounded-lg border border-edge bg-paper p-5 shadow-sm">
            <ol className="space-y-3 text-[15px]">
              {["Elija la pestana (YouTube, una reunion, un curso...)", "Pulse Iniciar monitorizacion en el popup", "Cambie a su correo y siga trabajando", "Cada fragmento con sonido queda en la biblioteca", "Descargue o convierta a MP3, FLAC, AAC, Opus..."].map((t, i) => (
                <li key={t} className="flex gap-3"><span className="num grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-brands text-xs font-bold text-brand">{i + 1}</span><span>{t}</span></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.t} className="rounded-lg border border-edge bg-paper p-4 shadow-sm">
              <f.i size={19} className="text-brand" />
              <h3 className="mt-2 text-base font-bold">{f.t}</h3>
              <p className="mt-1 text-sm text-ink2">{f.d}</p>
            </article>
          ))}
        </section>

        <section id="probar" className="scroll-mt-20 pt-14">
          <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"><Gauge size={22} className="text-brand" /> Pruebe el detector con su propio audio</h2>
          <p className="mb-4 mt-1 max-w-3xl text-ink2">Esta demostracion ejecuta el mismo modulo <span className="num text-sm">audio-detector/detector.ts</span> que usa la extension, sobre las muestras reales de un archivo: nivel RMS/pico por bloque de 1024 muestras, histeresis, duracion minima y silencio sostenido. Las zonas sombreadas son los segmentos que se grabarian (incluyendo pre-buffer y cola).</p>
          <Playground />
        </section>

        <section id="instalar" className="scroll-mt-20 pt-14">
          <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"><Download size={22} className="text-brand" /> Instalacion</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              { t: "1. install.bat", d: "Comprueba Node.js y npm, instala dependencias, prepara FFmpeg/FFprobe locales, valida config\\ports.env y compila la extension en extension-dist\\." },
              { t: "2. Cargar la extension", d: "En chrome://extensions active el Modo desarrollador, pulse Cargar descomprimida y elija la carpeta extension-dist. Funciona en Chrome, Edge, Brave y otros Chromium 116+." },
              { t: "3. start.bat (opcional)", d: "Inicia el servicio multimedia para convertir a MP3, FLAC, AAC, M4A, OGG y Opus. Copie el token mostrado en Ajustes > Servicio multimedia." },
            ].map((s) => <article key={s.t} className="rounded-lg border border-edge bg-paper p-4 shadow-sm"><h3 className="font-bold">{s.t}</h3><p className="mt-1 text-sm text-ink2">{s.d}</p></article>)}
          </div>
          <p className="mt-3 flex items-start gap-2 text-sm text-ink2"><Layers size={16} className="mt-0.5 shrink-0 text-brand" />Scripts incluidos: install, start, stop, build, diagnostics, clean y configurar-puertos (.bat), todos en espanol y funcionales desde su propia carpeta.</p>
        </section>

        <section id="puertos" className="scroll-mt-20 pt-14">
          <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"><FolderCog size={22} className="text-brand" /> Puertos: un unico archivo de texto</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <pre className="num overflow-auto rounded-lg border border-edge bg-[#0d1b36] p-4 text-sm leading-relaxed text-[#cfe0ff]">{`# config/ports.env  (fuente unica)
PORT_MULTIMEDIA=<puerto de la API>
PORT_HEALTH=<puerto de diagnostico>

# Cambiar y comprobar:
configurar-puertos.bat
# Reiniciar tras editar:
stop.bat  y despues  start.bat`}</pre>
            <ul className="space-y-2 text-sm text-ink2">
              <li className="flex gap-2"><Lock size={15} className="mt-0.5 shrink-0 text-brand" />Servicio solo en 127.0.0.1, con token, validacion de Host y Origin.</li>
              <li className="flex gap-2"><Terminal size={15} className="mt-0.5 shrink-0 text-brand" />Los .bat, el servicio Node.js y la extension leen el mismo archivo; no hay puertos en el codigo.</li>
              <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand" />Si un puerto esta ocupado se muestra PID y proceso; nunca se termina un proceso ajeno ni se cambia el puerto en silencio.</li>
            </ul>
          </div>
        </section>

        <section id="limites" className="scroll-mt-20 pt-14">
          <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"><TriangleAlert size={22} className="text-amber" /> Limitaciones reales de Chromium</h2>
          <ul className="mt-4 grid gap-3 text-sm text-ink2 md:grid-cols-2">
            <li className="rounded-lg border border-edge bg-paper p-4"><b className="text-ink">Invocacion obligatoria.</b> chrome.tabCapture solo permite capturar una pestana tras invocar la extension en ella (clic en el icono). Abra el popup en la pestana de origen y pulse Iniciar; despues puede cambiar libremente de pestana.</li>
            <li className="rounded-lg border border-edge bg-paper p-4"><b className="text-ink">Paginas protegidas.</b> No se pueden capturar chrome://, edge://, la tienda de extensiones ni paginas internas.</li>
            <li className="rounded-lg border border-edge bg-paper p-4"><b className="text-ink">Reinicio del navegador.</b> La captura no se reanuda sola: exige un gesto explicito del usuario.</li>
            <li className="rounded-lg border border-edge bg-paper p-4"><b className="text-ink">Limites del detector.</b> Identifica limites perceptibles de actividad segun parametros; no el primer ni el ultimo bit digital.</li>
          </ul>
        </section>
      </main>
      <footer className="border-t border-edge bg-paper py-5 text-center text-sm text-ink3">AUDIO CAPTURE STUDIO - procesamiento 100% local, sin telemetria ni CDN.</footer>
    </div>
  );
}
