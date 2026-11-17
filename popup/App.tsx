import { useEffect, useState } from 'react';
import { Moon, PanelRight, Replace, Sun } from 'lucide-react';
import logo from '../icons/logo.svg';
import { CaptureControls, MODE_LABEL } from '../components/CaptureControls';
import { DialogProvider } from '../components/Modal';
import { Favicon, PhaseBadge, TabPickerModal, useTimers } from '../components/session-widgets';
import { ToastProvider, useToast } from '../components/Toast';
import { TooltipDelayProvider } from '../components/Tooltip';
import { Button, IconButton, Segmented, Stat } from '../components/ui';
import { LevelMeter } from '../visualizers/LevelMeter';
import { getFeed } from '../shared/feed';
import { formatBytes, formatDuration } from '../shared/format';
import { useSelectedTab } from '../shared/session-ui';
import { useSession, useSettings, useTheme } from '../shared/hooks';
import { PHASE_META } from '../shared/session-ui';
import { capturability } from '../shared/tabs';
import type { CaptureMode } from '../shared/types';

function Popup() {
  const [settings, update] = useSettings();
  useTheme(settings.theme);
  const session = useSession();
  const { tab, select } = useSelectedTab(session);
  const toast = useToast();
  const t = useTimers(session);
  const [picker, setPicker] = useState(false);

  useEffect(() => getFeed().onEvent((e) => toast.push(e.level, e.text)), [toast]);

  // El popup se abre sobre la pestana activa: Chromium concede activeTab a esa pestana,
  // asi que se preselecciona como origen (requisito de chrome.tabCapture).
  const [invoked, setInvoked] = useState<number | null>(null);
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (t?.id !== undefined && capturability(t).ok) setInvoked(t.id);
    });
  }, []);
  useEffect(() => {
    if (invoked !== null && !session.active) void select(invoked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoked, session.active]);

  const dark = document.documentElement.dataset.theme === 'dark';
  const shown = session.active ? session.tab : tab ? { title: tab.title ?? '', domain: new URL(tab.url ?? 'about:blank').hostname.replace(/^www\./, ''), url: tab.url ?? '' } : null;

  const openPanel = async () => {
    const w = await chrome.windows.getCurrent();
    if (w.id !== undefined) await chrome.sidePanel.open({ windowId: w.id });
    window.close();
  };

  return (
    <TooltipDelayProvider value={settings.ui.tooltipDelay}>
      <div className="flex flex-col gap-3 bg-bg p-3">
        <header className="flex items-center gap-2">
          <img src={logo} alt="" width={26} height={26} className="rounded-sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="text-lg font-bold tracking-tight">AUDIO CAPTURE STUDIO</h1>
          </div>
          <IconButton icon={dark ? Sun : Moon} label={dark ? 'Tema claro' : 'Tema oscuro'} onClick={() => update((s) => ({ ...s, theme: dark ? 'light' : 'dark' }))} />
          <IconButton icon={PanelRight} label="Abrir panel completo" hint="Espectrograma, deteccion, biblioteca y exportacion" onClick={() => void openPanel()} />
        </header>

        <section className="rounded-lg border border-line bg-surface p-3 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <PhaseBadge phase={session.phase} />
            <span className="text-sm font-medium text-faint">Modo {MODE_LABEL[session.mode ?? settings.mode]}</span>
          </div>
          <p className="mt-2 text-sm text-muted">{session.error && session.phase === 'error' ? session.error : PHASE_META[session.phase].desc}</p>
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
            <Stat label="Audio grabado" value={formatDuration(t.audio)} tone={session.recording ? 'text-rec' : undefined} />
            <Stat label="Sesion" value={formatDuration(t.session)} />
            <Stat label="Segmentos" value={session.segments} sub={formatBytes(session.totalBytes)} />
          </div>
          <div className="mt-3">
            <LevelMeter compact />
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface p-3 shadow-soft">
          <div className="flex items-center gap-2.5">
            <Favicon url={shown?.url} size={22} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{shown?.title || 'Ninguna pestana seleccionada'}</div>
              <div className="truncate text-sm text-faint">{shown ? shown.domain : 'Elija la pestana a capturar'}</div>
            </div>
            <Button variant="secondary" size="sm" icon={Replace} disabled={session.active} onClick={() => setPicker(true)}>
              {session.active ? 'Bloqueada' : 'Cambiar'}
            </Button>
          </div>
          <div className="mt-3">
            <Segmented<CaptureMode> label="Modo de grabacion" value={session.mode ?? settings.mode} disabled={session.active}
              onChange={(m) => update((s) => ({ ...s, mode: m }))}
              options={[
                { value: 'smart', label: 'Inteligente', hint: 'Graba solo cuando hay sonido' },
                { value: 'continuous', label: 'Continuo', hint: 'Graba desde Iniciar hasta Detener' },
                { value: 'manual', label: 'Manual', hint: 'Iniciar, pausar, reanudar y finalizar' },
              ]} />
          </div>
        </section>

        <CaptureControls session={session} tab={tab} mode={settings.mode} onNeedTab={() => setPicker(true)} />
        <TabPickerModal open={picker} onClose={() => setPicker(false)} selectedId={tab?.id} onPick={(t2) => void select(t2.id ?? -1)} />
      </div>
    </TooltipDelayProvider>
  );
}

export function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <Popup />
      </DialogProvider>
    </ToastProvider>
  );
}
