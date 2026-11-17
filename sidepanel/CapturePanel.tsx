import { useState } from 'react';
import { Activity, AudioLines, Clock, Info, Lock, Radio, Replace, SlidersHorizontal } from 'lucide-react';
import { CaptureControls, MODE_LABEL } from '../components/CaptureControls';
import { Favicon, PhaseBadge, useTimers } from '../components/session-widgets';
import { Tip } from '../components/Tooltip';
import { Button, Card, IconButton, Segmented, SectionTitle, Select, Slider, Stat } from '../components/ui';
import { Spectrogram } from '../visualizers/Spectrogram';
import { Waveform } from '../visualizers/Waveform';
import { LevelMeter } from '../visualizers/LevelMeter';
import { PHASE_META } from '../shared/session-ui';
import { formatBytes, formatClock, formatDuration } from '../shared/format';
import { useLevels } from '../shared/hooks';
import type { AppSettings } from '../shared/settings';
import type { CaptureMode, SessionState } from '../shared/types';
import { TechInfo } from './TechInfo';

interface Props {
  session: SessionState;
  tab: chrome.tabs.Tab | null;
  settings: AppSettings;
  update: (fn: (s: AppSettings) => AppSettings) => void;
  onPick: () => void;
  onTech: () => void;
}

export function CapturePanel({ session, tab, settings, update, onPick, onTech }: Props) {
  const t = useTimers(session);
  const frame = useLevels(session.active);
  const [vizOpts, setVizOpts] = useState(false);
  const v = settings.viz;
  const shown = session.active ? session.tab : tab ? { title: tab.title ?? '', domain: safeHost(tab.url), url: tab.url ?? '' } : null;
  const setViz = (patch: Partial<AppSettings['viz']>) => update((s) => ({ ...s, viz: { ...s.viz, ...patch } }));

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3">
        <SectionTitle icon={Radio}>Pestana de origen</SectionTitle>
        <div className="mt-2 flex items-center gap-2.5">
          <Favicon url={shown?.url} size={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{shown?.title || 'Ninguna pestana seleccionada'}</div>
            <div className="truncate text-sm text-faint">{shown?.domain || 'Elija la pestana cuyo audio desea capturar'}</div>
          </div>
          {session.active ? (
            <Tip content="Origen bloqueado durante la sesion" hint="Detenga la sesion para cambiar de pestana"><span className="flex items-center gap-1 rounded-sm bg-waits px-2 py-1 text-xs font-semibold text-wait"><Lock size={12} />En captura</span></Tip>
          ) : (
            <Button variant="secondary" size="sm" icon={Replace} onClick={onPick}>{tab ? 'Cambiar' : 'Elegir'}</Button>
          )}
        </div>
        <div className="mt-3">
          <Segmented<CaptureMode> label="Modo de grabacion" value={session.mode ?? settings.mode} disabled={session.active}
            onChange={(m) => update((s) => ({ ...s, mode: m }))}
            options={[
              { value: 'smart', label: 'Inteligente', hint: 'Monitoriza y graba solo cuando detecta sonido; un segmento por actividad' },
              { value: 'continuous', label: 'Continuo', hint: 'Graba desde Iniciar hasta Detener, sin cortar por silencio' },
              { value: 'manual', label: 'Manual', hint: 'Usted controla iniciar, pausar, reanudar y finalizar' },
            ]} />
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex items-center justify-between gap-2">
          <PhaseBadge phase={session.phase} />
          <span className="text-sm font-medium text-faint">Modo {MODE_LABEL[session.mode ?? settings.mode]}</span>
        </div>
        <p className="mt-2 text-sm text-muted">{session.phase === 'error' && session.error ? session.error : PHASE_META[session.phase].desc}</p>
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
          <Stat label="Sesion" value={formatDuration(t.session)} sub={`Inicio ${formatClock(session.sessionStartedAt)}`} />
          <Stat label="Audio grabado" value={formatDuration(t.audio)} tone={session.recording ? 'text-rec' : undefined} sub="Solo con sonido" />
          <Stat label="Segmento actual" value={session.segStartedAt || session.segRunningSince ? formatDuration(t.segment, true) : '--:--'} sub={session.segStartedAt ? `Desde ${formatClock(session.segStartedAt)}` : 'Sin segmento'} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
          <Stat label="Segmentos" value={session.segments} />
          <Stat label="Tamano" value={formatBytes(session.totalBytes)} />
          <Stat label="Fin" value={session.sessionEndedAt ? formatClock(session.sessionEndedAt) : '--:--:--'} sub={session.lastSegment ? `Ultimo ${formatDuration(session.lastSegment.durationMs)}` : undefined} />
        </div>
        <div className="mt-3"><CaptureControls session={session} tab={tab} mode={settings.mode} onNeedTab={onPick} /></div>
      </Card>

      <Card className="p-3">
        <SectionTitle icon={AudioLines} action={<IconButton size="sm" icon={SlidersHorizontal} label="Ajustes de visualizacion" active={vizOpts} onClick={() => setVizOpts((o) => !o)} />}>Senal en tiempo real</SectionTitle>
        <div className="mt-2">
          <Segmented<AppSettings['viz']['view']> label="Vista" value={v.view} onChange={(view) => setViz({ view })}
            options={[{ value: 'spectrogram', label: 'Espectrograma' }, { value: 'waveform', label: 'Onda' }, { value: 'both', label: 'Combinada' }]} />
        </div>
        {vizOpts ? (
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-line bg-surface2 p-3">
            <Select label="Zoom de frecuencia" value={v.maxFreq} onChange={(e) => setViz({ maxFreq: Number(e.target.value) })}>
              <option value={2000}>0 - 2 kHz (graves)</option>
              <option value={4000}>0 - 4 kHz (voz)</option>
              <option value={8000}>0 - 8 kHz</option>
              <option value={16000}>0 - 16 kHz</option>
              <option value={22000}>Completo</option>
            </Select>
            <Select label="Escala" value={v.scale} onChange={(e) => setViz({ scale: e.target.value as 'log' | 'linear' })}>
              <option value="log">Logaritmica</option>
              <option value="linear">Lineal</option>
            </Select>
            <Slider label="Sensibilidad visual" min={0} max={160} step={5} value={160 - v.floor} onChange={(x) => setViz({ floor: 160 - x })} format={(x) => `${Math.round((x / 160) * 100)}%`} />
            <Slider label="Velocidad" min={1} max={4} value={v.speed} onChange={(speed) => setViz({ speed })} format={(x) => `${x} px/fotograma`} />
          </div>
        ) : null}
        <div className="relative mt-3 flex flex-col gap-2">
          {v.view !== 'waveform' ? <Spectrogram viz={v} height={v.view === 'both' ? 140 : 190} /> : null}
          {v.view !== 'spectrogram' ? <Waveform viz={v} height={v.view === 'both' ? 88 : 150} /> : null}
          {!session.active ? (
            <div className="acs-fade-in absolute inset-0 flex items-center justify-center rounded-md bg-[var(--viz-bg)]/70 px-6 text-center text-sm font-medium text-white/80 backdrop-blur-[1px]">
              <Activity size={16} className="mr-2 shrink-0" />Sin senal: inicie una sesion para ver el audio de la pestana
            </div>
          ) : null}
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-faint">
            <span>Nivel RMS</span>
            <span className="flex items-center gap-3"><span className="flex items-center gap-1"><i className="h-2 w-0.5 bg-silence" />activacion</span><span className="flex items-center gap-1"><i className="h-2 w-px bg-faint" />silencio</span></span>
          </div>
          <LevelMeter />
        </div>
      </Card>

      <Card className="p-3">
        <SectionTitle icon={Clock} action={<IconButton size="sm" icon={Info} label="Ver informacion tecnica completa" onClick={onTech} />}>Informacion tecnica</SectionTitle>
        <div className="mt-2"><TechInfo session={session} settings={settings} frame={frame} /></div>
      </Card>
    </div>
  );
}

function safeHost(url?: string): string {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
