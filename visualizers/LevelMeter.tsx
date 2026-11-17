import { useEffect, useRef } from 'react';
import { getFeed } from '../shared/feed';
import { cn } from '../components/cn';

const MIN_DB = -80;
const pct = (db: number) => `${Math.max(0, Math.min(100, ((db - MIN_DB) / -MIN_DB) * 100))}%`;

/** Medidor RMS/pico con marcas de los umbrales de activacion y silencio (valores reales). */
export function LevelMeter({ compact, showMarks = true }: { compact?: boolean; showMarks?: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const peak = useRef<HTMLDivElement>(null);
  const on = useRef<HTMLDivElement>(null);
  const off = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const hold = useRef({ db: MIN_DB, t: 0 });

  useEffect(() => {
    const unsub = getFeed().onFrame((f) => {
      if (bar.current) {
        bar.current.style.width = pct(f.rmsDb);
        bar.current.dataset.active = f.detector === 'active' ? '1' : '0';
      }
      const now = performance.now();
      if (f.peakDb > hold.current.db || now - hold.current.t > 1200) hold.current = { db: f.peakDb, t: now };
      if (peak.current) peak.current.style.left = pct(hold.current.db);
      if (on.current) on.current.style.left = pct(f.onDb);
      if (off.current) off.current.style.left = pct(f.offDb);
      if (label.current) label.current.textContent = f.rmsDb <= -99 ? '-inf' : f.rmsDb.toFixed(0);
    });
    return unsub;
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div className={cn('relative flex-1 overflow-hidden rounded-xs bg-surface3', compact ? 'h-2' : 'h-2.5')} role="meter" aria-label="Nivel de audio RMS" aria-valuemin={MIN_DB} aria-valuemax={0}>
        <div ref={bar} className="h-full w-0 rounded-xs bg-primary transition-[width] duration-75 data-[active='1']:bg-rec" style={{ transitionTimingFunction: 'linear' }} />
        <div ref={peak} className="absolute inset-y-0 w-px bg-fg/70" />
        {showMarks ? (
          <>
            <div ref={on} className="absolute inset-y-0 w-0.5 bg-silence" />
            <div ref={off} className="absolute inset-y-0 w-px bg-faint" />
          </>
        ) : null}
      </div>
      <span className="num w-14 shrink-0 text-right text-xs text-muted">
        <span ref={label}>-inf</span> dB
      </span>
    </div>
  );
}
