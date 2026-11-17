import { useEffect, useMemo, useState } from 'react';
import { Check, Globe, RefreshCw, Search, Volume2 } from 'lucide-react';
import { cn } from './cn';
import { Modal } from './Modal';
import { Badge, Button, IconButton } from './ui';
import { Tip } from './Tooltip';
import { PHASE_META, faviconUrl } from '../shared/session-ui';
import { capturability } from '../shared/tabs';
import { domainOf, formatDuration } from '../shared/format';
import { useNow } from '../shared/hooks';
import type { Phase, SessionState } from '../shared/types';

const TONE = {
  neutral: { text: 'text-muted', bg: 'bg-surface3', dot: 'bg-faint' },
  wait: { text: 'text-wait', bg: 'bg-waits', dot: 'bg-wait acs-dot-wait' },
  rec: { text: 'text-rec', bg: 'bg-recs', dot: 'bg-rec acs-dot-rec' },
  silence: { text: 'text-silence', bg: 'bg-silences', dot: 'bg-silence' },
  proc: { text: 'text-proc', bg: 'bg-procs', dot: 'bg-proc acs-dot-wait' },
  done: { text: 'text-done', bg: 'bg-dones', dot: 'bg-done' },
};

export function PhaseBadge({ phase, size = 'md' }: { phase: Phase; size?: 'sm' | 'md' }) {
  const m = PHASE_META[phase];
  const t = TONE[m.tone];
  const calm = phase === 'recording' ? '' : '';
  return (
    <span aria-live="polite" className={cn('inline-flex items-center gap-2 rounded-md font-semibold uppercase tracking-wide', t.bg, t.text, size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-2xs', calm)}>
      <span className={cn('h-2 w-2 rounded-full', t.dot)} />
      {m.label}
    </span>
  );
}

export function Favicon({ url, size = 18 }: { url?: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!url || err) return <Globe size={size - 2} className="shrink-0 text-faint" />;
  return <img src={faviconUrl(url)} width={size} height={size} alt="" onError={() => setErr(true)} className="shrink-0 rounded-xs" />;
}

/** Cronometros calculados con timestamps reales. */
export function useTimers(s: SessionState) {
  const ticking = s.active;
  const now = useNow(ticking, 150);
  const segment = s.segBaseMs + (s.segRunningSince ? now - s.segRunningSince : 0);
  const session = s.sessionStartedAt ? (s.active ? now : (s.sessionEndedAt ?? now)) - s.sessionStartedAt : 0;
  return { session, audio: s.audioTotalMs + segment, segment };
}

interface PickerProps { open: boolean; onClose: () => void; onPick: (tab: chrome.tabs.Tab) => void; selectedId?: number }

/** Selector profesional de pestanas: favicon, titulo, dominio, disponibilidad e indicador de seleccion. */
export function TabPickerModal({ open, onClose, onPick, selectedId }: PickerProps) {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const all = await chrome.tabs.query({});
    setTabs(all);
    setLoading(false);
  };
  useEffect(() => {
    if (open) void load();
  }, [open]);

  const rows = useMemo(() => {
    const f = q.trim().toLowerCase();
    return tabs
      .filter((t) => !f || (t.title ?? '').toLowerCase().includes(f) || (t.url ?? '').toLowerCase().includes(f))
      .map((t) => ({ t, cap: capturability(t) }))
      .sort((a, b) => Number(b.cap.ok) - Number(a.cap.ok) || Number(Boolean(b.t.audible)) - Number(Boolean(a.t.audible)));
  }, [tabs, q]);

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Seleccionar pestana" description="Solo se captura el audio de la pestana elegida; no se usa el microfono ni otras pestanas. Chromium exige haber pulsado el icono de la extension en esa pestana al menos una vez."
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line2 bg-surface px-2.5 focus-within:border-primary">
          <Search size={15} className="text-faint" />
          <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por titulo o dominio" aria-label="Buscar pestanas" className="w-full bg-transparent text-base outline-none" />
        </div>
        <IconButton icon={RefreshCw} label="Actualizar lista" onClick={() => void load()} disabled={loading} className={loading ? '[&_svg]:acs-spin' : ''} />
      </div>
      <ul className="-mx-1 flex flex-col gap-1" aria-label="Pestanas abiertas">
        {rows.map(({ t, cap }) => {
          const on = t.id === selectedId;
          const btn = (
            <button type="button" disabled={!cap.ok} onClick={() => { onPick(t); onClose(); }}
              className={cn('flex w-full items-center gap-3 rounded-md border px-2.5 py-2 text-left transition-colors', on ? 'border-primaryl bg-primarys' : 'border-transparent hover:bg-surface3', !cap.ok && 'cursor-not-allowed opacity-55 hover:bg-transparent')}>
              <Favicon url={t.url} size={20} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{t.title || t.url}</span>
                <span className="block truncate text-sm text-faint">{domainOf(t.url ?? '') || t.url}</span>
              </span>
              {t.audible ? <Tip content="Esta pestana esta reproduciendo audio"><Volume2 size={15} className="shrink-0 text-wait" /></Tip> : null}
              {cap.ok ? <Badge tone={on ? 'primary' : 'done'}>{on ? 'Seleccionada' : 'Disponible'}</Badge> : <Badge>No disponible</Badge>}
              {on ? <Check size={16} className="shrink-0 text-primary" /> : null}
            </button>
          );
          return <li key={t.id}>{cap.ok ? btn : <Tip content={cap.reason ?? ''} className="flex w-full" side="left">{btn}</Tip>}</li>;
        })}
        {!rows.length ? <li className="py-8 text-center text-base text-faint">{loading ? 'Cargando...' : 'No hay pestanas que coincidan'}</li> : null}
      </ul>
    </Modal>
  );
}

export { formatDuration };
