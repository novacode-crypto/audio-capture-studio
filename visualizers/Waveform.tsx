import { useEffect, useRef } from 'react';
import { getFeed } from '../shared/feed';
import type { AppSettings } from '../shared/settings';

/** Forma de onda real: envolvente min/max de las muestras medidas por el AudioWorklet. */
export function Waveform({ viz, height = 96 }: { viz: AppSettings['viz']; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(viz.speed);
  speedRef.current = viz.speed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const CAP = 4096;
    const mins = new Float32Array(CAP);
    const maxs = new Float32Array(CAP);
    const rec = new Uint8Array(CAP);
    let head = 0;
    let count = 0;
    let dirty = true;
    let thr = { on: -46, off: -54 };
    let peakHold = 0;
    let raf = 0;
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

    const resize = () => {
      canvas.width = Math.max(40, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.floor(height * dpr);
      dirty = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const comp = (a: number) => Math.sign(a) * Math.sqrt(Math.abs(a)); // compresion raiz para ver senales bajas

    const off = getFeed().onFrame((f) => {
      mins[head] = f.min;
      maxs[head] = f.max;
      rec[head] = getFeed().state.recording ? 1 : 0;
      head = (head + 1) % CAP;
      count = Math.min(CAP, count + 1);
      thr = { on: f.onDb, off: f.offDb };
      peakHold = Math.max(peakHold * 0.995, Math.max(Math.abs(f.min), Math.abs(f.max)));
      dirty = true;
    });

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!dirty) return;
      dirty = false;
      const W = canvas.width;
      const H = canvas.height;
      const mid = H / 2;
      const colW = Math.max(1, Math.round(speedRef.current * dpr));
      const visible = Math.min(count, Math.floor(W / colW));
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = css('--viz-bg');
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = css('--viz-grid');
      ctx.fillRect(0, mid, W, 1);
      // umbrales de deteccion como amplitud equivalente (RMS de senoidal -> pico)
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineWidth = 1;
      for (const [db, color] of [[thr.on, css('--viz-peak')], [thr.off, css('--viz-text')]] as const) {
        const a = Math.min(1, comp(Math.pow(10, db / 20) * Math.SQRT2));
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.65;
        for (const s of [-1, 1]) {
          const y = Math.round(mid - s * a * (mid - 2));
          ctx.beginPath();
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(W, y + 0.5);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const wave = css('--viz-wave');
      const recColor = css('--rec');
      for (let i = 0; i < visible; i++) {
        const idx = (head - 1 - i + CAP * 2) % CAP;
        const x = W - (i + 1) * colW;
        const top = mid - comp(maxs[idx]) * (mid - 2);
        const bot = mid - comp(mins[idx]) * (mid - 2);
        ctx.fillStyle = Math.max(Math.abs(mins[idx]), Math.abs(maxs[idx])) > 0.985 ? '#ff4d4f' : rec[idx] ? recColor : wave;
        ctx.fillRect(x, top, colW, Math.max(1, bot - top));
      }
      if (peakHold > 0.01) {
        const y = mid - comp(Math.min(1, peakHold)) * (mid - 2);
        ctx.fillStyle = css('--viz-peak');
        ctx.globalAlpha = 0.5;
        ctx.fillRect(W - 6 * dpr, y, 6 * dpr, 1);
        ctx.fillRect(W - 6 * dpr, H - y, 6 * dpr, 1);
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      off();
      ro.disconnect();
    };
  }, [height]);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-[var(--viz-bg)]" style={{ height }}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="Forma de onda en tiempo real" role="img" />
    </div>
  );
}
