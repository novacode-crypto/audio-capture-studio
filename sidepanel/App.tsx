import { useEffect, useRef, useState } from 'react';
import { Library, Moon, Radio, Settings, SlidersHorizontal, Sun } from 'lucide-react';
import logo from '../icons/logo.svg';
import { DialogProvider } from '../components/Modal';
import { PhaseBadge, TabPickerModal } from '../components/session-widgets';
import { ToastProvider, useToast } from '../components/Toast';
import { TooltipDelayProvider } from '../components/Tooltip';
import { IconButton } from '../components/ui';
import { cn } from '../components/cn';
import { sendCommand } from '../shared/bus';
import { getFeed } from '../shared/feed';
import { useSession, useSettings, useTheme } from '../shared/hooks';
import { useSelectedTab } from '../shared/session-ui';
import { useService } from '../shared/use-service';
import type { RecordingRecord } from '../shared/types';
import { listRecordings } from '../storage/db';
import { CapturePanel } from './CapturePanel';
import { DetectionPanel } from './DetectionPanel';
import { ExportModal } from './ExportModal';
import { RecordingInfoModal, TechModal } from './InfoModals';
import { LibraryPanel } from './LibraryPanel';
import { SettingsModal } from './SettingsModal';

type TabId = 'capture' | 'detection' | 'library';

function Panel() {
  const [settings, update, ready] = useSettings();
  useTheme(settings.theme);
  const session = useSession();
  const { tab, select } = useSelectedTab(session);
  const toast = useToast();
  const [view, setView] = useState<TabId>('capture');
  const [picker, setPicker] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tech, setTech] = useState(false);
  const [exp, setExp] = useState<{ rec: RecordingRecord; mode: 'download' | 'convert' } | null>(null);
  const [info, setInfo] = useState<RecordingRecord | null>(null);
  const [count, setCount] = useState(0);
  const { status: service, refresh } = useService(settings, () => toast.push('error', 'Se perdio la conexion con el servicio multimedia'));

  useEffect(() => getFeed().onEvent((e) => toast.push(e.level, e.text)), [toast]);
  useEffect(() => {
    const load = () => void listRecordings().then((l) => setCount(l.length));
    load();
    return getFeed().onLibrary(load);
  }, []);

  // Los ajustes de deteccion se aplican en caliente a la sesion en curso.
  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (!session.active) return;
    const t = window.setTimeout(() => void sendCommand({ target: 'offscreen', type: 'settings-changed', settings }), 200);
    return () => window.clearTimeout(t);
  }, [settings, ready, session.active]);

  const dark = document.documentElement.dataset.theme === 'dark';
  const tabs: { id: TabId; label: string; icon: typeof Radio; badge?: number }[] = [
    { id: 'capture', label: 'Captura', icon: Radio },
    { id: 'detection', label: 'Deteccion', icon: SlidersHorizontal },
    { id: 'library', label: 'Biblioteca', icon: Library, badge: count },
  ];

  return (
    <TooltipDelayProvider value={settings.ui.tooltipDelay}>
      <div className="flex h-screen min-w-[320px] flex-col bg-bg">
        <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
          <img src={logo} alt="" width={28} height={28} className="rounded-sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-lg font-bold tracking-tight">AUDIO CAPTURE STUDIO</h1>
            <div className="mt-0.5"><PhaseBadge phase={session.phase} size="sm" /></div>
          </div>
          <IconButton icon={dark ? Sun : Moon} label={dark ? 'Tema claro' : 'Tema oscuro'} onClick={() => update((s) => ({ ...s, theme: dark ? 'light' : 'dark' }))} />
          <IconButton icon={Settings} label="Configuracion" onClick={() => setSettingsOpen(true)} />
        </header>
        <nav className="flex gap-1 border-b border-line bg-surface px-2" role="tablist" aria-label="Secciones">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={view === t.id} onClick={() => setView(t.id)}
              className={cn('relative flex items-center gap-1.5 px-3 py-2.5 text-base font-medium transition-colors', view === t.id ? 'text-primary' : 'text-muted hover:text-fg')}>
              <t.icon size={15} strokeWidth={2.1} />{t.label}
              {t.badge ? <span className="num rounded-full bg-surface3 px-1.5 text-2xs text-muted">{t.badge}</span> : null}
              {view === t.id ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
            </button>
          ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto p-3" role="tabpanel">
          {view === 'capture' ? <CapturePanel session={session} tab={tab} settings={settings} update={update} onPick={() => setPicker(true)} onTech={() => setTech(true)} /> : null}
          {view === 'detection' ? <DetectionPanel settings={settings} update={update} session={session} /> : null}
          {view === 'library' ? <LibraryPanel onExport={(rec, mode) => setExp({ rec, mode })} onInfo={setInfo} /> : null}
        </main>
      </div>
      <TabPickerModal open={picker} onClose={() => setPicker(false)} selectedId={tab?.id} onPick={(t) => void select(t.id ?? -1)} />
      {settingsOpen ? <SettingsModal settings={settings} update={update} service={service} refresh={refresh} onClose={() => setSettingsOpen(false)} /> : null}
      {tech ? <TechModal session={session} settings={settings} onClose={() => setTech(false)} /> : null}
      {exp ? <ExportModal rec={exp.rec} mode={exp.mode} settings={settings} update={update} service={service} onClose={() => setExp(null)} /> : null}
      {info ? <RecordingInfoModal rec={info} settings={settings} service={service} onClose={() => setInfo(null)} /> : null}
    </TooltipDelayProvider>
  );
}

export function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <Panel />
      </DialogProvider>
    </ToastProvider>
  );
}
