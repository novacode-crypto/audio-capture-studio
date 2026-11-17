import { useEffect, useMemo, useRef } from 'react';
import { getFeed } from '../shared/feed';
import type { AppSettings } from '../shared/settings';

type Viz = AppSettings['viz'];

const FMIN = 40;
const STOPS: [number, number, number, number][] = [
  [0, 7, 14, 30],
  [0.2, 24, 52, 128],
  [0.45, 46, 112, 240],
  [0.68, 88, 206, 255],
  [0.86, 255, 209, 102],
  [1, 255, 250, 232],
];

function buildLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    const [t0, r0, g0, b0] = STOPS[k];
    const [t1, r1, g1, b1] = STOPS[k + 1];
    const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    lut[i * 3] = r0 + (r1 - r0) * u;
    lut[i * 3 + 1] = g0 + (g1 - g0) * u;
    lut[i * 3 + 2] = b0 + (b1 - b0) * u;
  }
  return lut;
}
const LUT = buildLut();

export function freqTicks(maxFreq: number, scale: Viz['scale']): { f: number; pos: number }[] {
  const all = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000];
  return all
    .filter((f) => f <= maxFreq * 0.98 && f >= FMIN)
    .map((f) => ({ f, pos: scale === 'log' ? 1 - Math.log(f / FMIN) / Math.log(maxFreq / FMIN) : 1 - f / maxFreq }));
}

/** Espectrograma real: cada columna es el FFT (4096) del AnalyserNode del documento offscreen. */
export function Spectrogram({ viz, height = 150 }: { viz: Viz; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef(viz);
  vizRef.current = viz;
  const ticks = useMemo(() => freqTicks(viz.maxFreq, viz.scale), [viz.maxFreq, viz.scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let map: { lo: Uint16Array; hi: Uint16Array; key: string } | null = null;
    let col: ImageData | null = null;
    const bg = () => {
      ctx.fillStyle = `rgb(${LUT[0]},${LUT[1]},${LUT[2]})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    const resize = () => {
      const w = Math.max(40, Math.floor(canvas.clientWidth * dpr));
      const h = Math.floor(height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        map = null;
        bg();
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const off = getFeed().onFrame((f) => {
      const v = vizRef.current;
      const H = canvas.height;
      const n = f.spec.length;
      const nyq = f.sampleRate / 2;
      const key = `${H}|${v.maxFreq}|${v.scale}|${n}|${nyq}`;
      if (!map || map.key !== key) {
        const lo = new Uint16Array(H);
        const hi = new Uint16Array(H);
        const fmax = Math.min(v.maxFreq, nyq);
        const freqAt = (t: number) => (v.scale === 'log' ? FMIN * Math.pow(fmax / FMIN, t) : fmax * t);
        for (let y = 0; y < H; y++) {
          const fHi = freqAt(1 - y / H);
          const fLo = freqAt(1 - (y + 1) / H);
          lo[y] = Math.min(n - 1, Math.floor((fLo / nyq) * n));
          hi[y] = Math.min(n - 1, Math.max(lo[y], Math.floor((fHi / nyq) * n)));
        }
        map = { lo, hi, key };
      }
      const colW = Math.max(1, Math.round(v.speed * dpr));
      if (!col || col.width !== colW || col.height !== H) col = ctx.createImageData(colW, H);
      const floor = v.floor;
      const span = 255 - floor;
      const data = col.data;
      for (let y = 0; y < H; y++) {
        let m = 0;
        for (let b = map.lo[y]; b <= map.hi[y]; b++) if (f.spec[b] > m) m = f.spec[b];
        const idx = m <= floor ? 0 : Math.min(255, Math.round(((m - floor) / span) * 255));
        const r = LUT[idx * 3];
        const g = LUT[idx * 3 + 1];
        const bl = LUT[idx * 3 + 2];
        for (let x = 0; x < colW; x++) {
          const o = (y * colW + x) * 4;
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = bl;
          data[o + 3] = 255;
        }
      }
      ctx.drawImage(canvas, -colW, 0);
      ctx.putImageData(col, canvas.width - colW, 0);
    });
    return () => {
      off();
      ro.disconnect();
    };
  }, [height]);

  return (
    <div className="relative overflow-hidden rounded-md border border-line bg-[var(--viz-bg)]" style={{ height }}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="Espectrograma en tiempo real" role="img" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-9">
        {ticks.map((t) => (
          <span key={t.f} style={{ top: `${t.pos * 100}%` }} className="num absolute left-1 -translate-y-1/2 rounded-xs bg-black/35 px-0.5 text-[9px] leading-none text-white/75">
            {t.f >= 1000 ? `${t.f / 1000}k` : t.f}
          </span>
        ))}
      </div>
      {ticks.map((t) => (
        <span key={`g${t.f}`} style={{ top: `${t.pos * 100}%` }} className="pointer-events-none absolute inset-x-9 h-px bg-white/10" />
      ))}
    </div>
  );
}
