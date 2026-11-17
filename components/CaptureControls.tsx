import { useState } from 'react';
import { Circle, Pause, Play, Radio, Square, Scissors } from 'lucide-react';
import { Button } from './ui';
import { useDialogs } from './Modal';
import { Tip } from './Tooltip';
import { sendCommand } from '../shared/bus';
import { startCapture } from '../shared/session-ui';
import { capturability } from '../shared/tabs';
import type { CaptureMode, SessionState } from '../shared/types';

export const MODE_LABEL: Record<CaptureMode, string> = { smart: 'Inteligente', continuous: 'Continuo', manual: 'Manual' };
const START_LABEL: Record<CaptureMode, string> = { smart: 'Iniciar monitorizacion', continuous: 'Iniciar grabacion continua', manual: 'Iniciar sesion manual' };

/** Controles de captura compartidos entre popup y side panel. */
export function CaptureControls({ session, tab, mode, onNeedTab }: { session: SessionState; tab: chrome.tabs.Tab | null; mode: CaptureMode; onNeedTab: () => void }) {
  const dialogs = useDialogs();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, title: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) await dialogs.error({ title, message: r.error ?? 'Error desconocido' });
  };

  const starting = session.phase === 'starting' || busy === 'start';
  if (!session.active) {
    const cap = tab ? capturability(tab) : { ok: false, reason: 'Seleccione una pestana' };
    return (
      <Tip content={cap.ok ? '' : (cap.reason ?? '')} disabled={cap.ok} className="flex w-full">
        <Button block loading={starting} icon={Radio} disabled={tab ? !cap.ok : false}
          onClick={() => (tab ? void run('start', () => startCapture(tab), 'No se pudo iniciar la sesion') : onNeedTab())}>
          {tab ? START_LABEL[mode] : 'Seleccionar pestana'}
        </Button>
      </Tip>
    );
  }

  const manualRecording = session.mode === 'manual' && (session.recording || session.phase === 'paused');
  const stop = (
    <Button variant="secondary" icon={Square} loading={busy === 'stop'} onClick={() => void run('stop', () => sendCommand({ target: 'background', type: 'stop-session' }), 'No se pudo detener la sesion')}>
      {session.mode === 'continuous' ? 'Detener y guardar' : 'Detener sesion'}
    </Button>
  );

  if (session.mode === 'manual') {
    return (
      <div className="flex flex-wrap gap-2">
        {!manualRecording ? (
          <Button variant="record" icon={Circle} loading={busy === 'rec'} disabled={session.phase === 'processing'} onClick={() => void run('rec', () => sendCommand({ target: 'offscreen', type: 'start-recording' }), 'No se pudo iniciar la grabacion')}>Iniciar grabacion</Button>
        ) : (
          <>
            {session.phase === 'paused' ? (
              <Button icon={Play} onClick={() => void sendCommand({ target: 'offscreen', type: 'resume' })}>Reanudar</Button>
            ) : (
              <Button variant="secondary" icon={Pause} onClick={() => void sendCommand({ target: 'offscreen', type: 'pause' })}>Pausar</Button>
            )}
            <Button variant="record" icon={Scissors} loading={busy === 'fin'} onClick={() => void run('fin', () => sendCommand({ target: 'offscreen', type: 'finalize-segment' }), 'No se pudo finalizar el segmento')}>Finalizar segmento</Button>
          </>
        )}
        {stop}
      </div>
    );
  }
  return <div className="flex">{<div className="w-full [&>button]:w-full">{stop}</div>}</div>;
}
