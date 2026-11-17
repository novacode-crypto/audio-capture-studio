// Pruebas del motor de deteccion con senales sinteticas reales (muestras PCM -> bloques RMS/pico).
// Ejecutar: npm run test:detector
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { ROOT, RUNTIME_DIR } from './lib/config.mjs';

fs.mkdirSync(RUNTIME_DIR, { recursive: true });
const out = path.join(RUNTIME_DIR, 'detector.test.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'audio-detector', 'detector.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { ActivityDetector } = await import(pathToFileURL(out).href);

const SR = 48000;
const BLOCK = 1024;
const dbToAmp = (db) => 10 ** (db / 20);

/** segs: [{ms, db(rms) | fromDb,toDb, kind:'tone'|'noise'}] */
function synth(segs) {
  const parts = [];
  for (const s of segs) {
    const n = Math.round((s.ms / 1000) * SR);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const db = s.db !== undefined ? s.db : s.fromDb + ((s.toDb - s.fromDb) * i) / n;
      if (db <= -120) continue;
      const amp = dbToAmp(db) * Math.SQRT2;
      a[i] = amp * Math.sin((2 * Math.PI * 440 * i) / SR + (s.kind === 'noise' ? Math.random() : 0));
    }
    parts.push(a);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const sig = new Float32Array(total);
  let o = 0;
  for (const p of parts) { sig.set(p, o); o += p.length; }
  return sig;
}

function run(sig, cfg) {
  const det = new ActivityDetector(cfg);
  const events = [];
  for (let i = 0; i + BLOCK <= sig.length; i += BLOCK) {
    let ss = 0, pk = 0;
    for (let j = 0; j < BLOCK; j++) { const v = sig[i + j]; ss += v * v; pk = Math.max(pk, Math.abs(v)); }
    const rms = Math.sqrt(ss / BLOCK);
    const t = ((i + BLOCK) / SR) * 1000;
    const ev = det.push(t, 20 * Math.log10(rms + 1e-9), 20 * Math.log10(pk + 1e-9));
    if (ev) events.push(ev);
  }
  return events;
}

const base = { onDb: -46, offDb: -54, sensitivity: 50, minActivityMs: 100, silenceMs: 1000, adaptive: false };
let failed = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'OK   ' : 'FALLO'} ${name} ${detail}`);
  if (!cond) failed++;
}
const starts = (e) => e.filter((x) => x.type === 'start');
const ends = (e) => e.filter((x) => x.type === 'end');

// 1. Silencio prolongado
let e = run(synth([{ ms: 5000, db: -120 }]), base);
check('Silencio prolongado: sin eventos', e.length === 0);

// 2. Un segmento limpio, inicio ~1000 ms y final por silencio sostenido
e = run(synth([{ ms: 1000, db: -120 }, { ms: 2000, db: -20 }, { ms: 3000, db: -120 }]), base);
check('Un segmento: 1 inicio y 1 fin', starts(e).length === 1 && ends(e).length === 1);
check('Inicio localizado (onset) en 1000 ms +-30', Math.abs(starts(e)[0].onsetMs - 1000) < 30, `onset=${starts(e)[0]?.onsetMs.toFixed(0)}`);
check('Ultimo sonido en 3000 ms +-30', Math.abs(ends(e)[0].lastSoundMs - 3000) < 30, `last=${ends(e)[0]?.lastSoundMs.toFixed(0)}`);
check('Fin emitido tras >=1000 ms de silencio', ends(e)[0].atMs - ends(e)[0].lastSoundMs >= 1000);

// 3. Pausa corta (400 ms) no corta; pausa larga (1500 ms) si
e = run(synth([{ ms: 500, db: -120 }, { ms: 1000, db: -22 }, { ms: 400, db: -120 }, { ms: 1000, db: -22 }, { ms: 2500, db: -120 }]), base);
check('Pausa corta 400 ms: un solo segmento', starts(e).length === 1 && ends(e).length === 1);
e = run(synth([{ ms: 500, db: -120 }, { ms: 1000, db: -22 }, { ms: 1500, db: -120 }, { ms: 1000, db: -22 }, { ms: 2500, db: -120 }]), base);
check('Pausa larga 1500 ms: dos segmentos', starts(e).length === 2 && ends(e).length === 2);

// 4. Volumen bajo: -48 dB RMS no activa con perfil normal, si con sensibilidad alta
const low = synth([{ ms: 500, db: -120 }, { ms: 2000, db: -48 }, { ms: 2500, db: -120 }]);
check('Volumen bajo (-48 dB) bajo umbral: sin deteccion', run(low, base).length === 0);
e = run(low, { ...base, sensitivity: 80 });
check('Volumen bajo con sensibilidad 80: detectado', starts(e).length === 1 && ends(e).length === 1);

// 5. Volumen variable (rampa -70 -> -20 dB)
e = run(synth([{ ms: 6000, fromDb: -70, toDb: -20 }, { ms: 2500, db: -120 }]), base);
check('Rampa de volumen: inicio al cruzar -46 dB (esperado 2880 ms +-80)', starts(e).length === 1 && Math.abs(starts(e)[0].onsetMs - 2880) < 80, `onset=${starts(e)[0]?.onsetMs.toFixed(0)}`);

// 6. Transitorio de 30 ms < duracion minima
e = run(synth([{ ms: 500, db: -120 }, { ms: 30, db: -15 }, { ms: 3000, db: -120 }]), { ...base, minActivityMs: 120 });
check('Click de 30 ms con minima de 120 ms: ignorado', e.length === 0);

// 7. Histeresis: nivel entre off y on mantiene el segmento activo pero no lo inicia
check('Histeresis: nivel intermedio (-50 dB) no inicia', run(synth([{ ms: 3000, db: -50 }]), base).length === 0);
e = run(synth([{ ms: 500, db: -120 }, { ms: 1000, db: -25 }, { ms: 2500, db: -50 }, { ms: 2500, db: -120 }]), base);
check('Histeresis: -50 dB mantiene activo', ends(e).length === 1 && ends(e)[0].lastSoundMs > 3900, `last=${ends(e)[0]?.lastSoundMs.toFixed(0)}`);

// 8. Umbral adaptativo con ruido de fondo constante
e = run(synth([{ ms: 3000, db: -40, kind: 'noise' }]), { ...base, adaptive: true });
check('Adaptativo: ruido constante -40 dB tras aprender el suelo no activa tras el arranque', starts(e).length <= 1);

console.log(failed ? `\n${failed} prueba(s) FALLIDAS` : '\nTodas las pruebas del detector han pasado');
fs.rmSync(out, { force: true });
process.exit(failed ? 1 : 0);
