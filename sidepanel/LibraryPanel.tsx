import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileAudio, Info, Pause, Pencil, Play, Repeat2, Trash2, Eraser, HardDrive } from 'lucide-react';
import { Modal, useDialogs } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, IconButton, SectionTitle } from '../components/ui';
import { getFeed } from '../shared/feed';
import { formatBytes, formatDateTime, formatDuration, sanitizeFilename } from '../shared/format';
import { clearRecordings, deleteRecording, listRecordings, storageUsage, updateRecording, type StorageUsage } from '../storage/db';
import type { RecordingRecord } from '../shared/types';

interface Props {
  onExport: (rec: RecordingRecord, mode: 'download' | 'convert') => void;
  onInfo: (rec: RecordingRecord) => void;
}

function CleanupModal({ list, onClose, onDone }: { list: RecordingRecord[]; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState(7);
  const [onlyConverted, setOnlyConverted] = useState(false);
  const toast = useToast();
  const victims = useMemo(() => {
    const limit = Date.now() - days * 86_400_000;
    return list.filter((r) => (onlyConverted ? r.kind === 'converted' : r.createdAt < limit));
  }, [list, days, onlyConverted]);
  const size = victims.reduce((n, r) => n + r.size, 0);
  const run = async () => {
    await Promise.all(victims.map((r) => deleteRecording(r.id)));
    toast.push('success', `Limpieza completada: ${victims.length} archivo(s), ${formatBytes(size)} liberados`);
    onDone();
    onClose();
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Limpiar biblioteca" description="Libera espacio local. Esta accion no se puede deshacer."
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" disabled={!victims.length} onClick={() => void run()}>Eliminar {victims.length}</Button></>}>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-base"><input type="radio" checked={!onlyConverted} onChange={() => setOnlyConverted(false)} />Anteriores a
          <select value={days} disabled={onlyConverted} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border border-line2 bg-surface px-1.5">
            {[1, 3, 7, 30, 90].map((d) => <option key={d} value={d}>{d} dia{d > 1 ? 's' : ''}</option>)}
          </select></label>
        <label className="flex items-center gap-2 text-base"><input type="radio" checked={onlyConverted} onChange={() => setOnlyConverted(true)} />Solo copias convertidas (temporales regenerables)</label>
        <p className="rounded-md bg-surface2 px-3 py-2 text-sm text-muted">Se eliminaran <b>{victims.length}</b> archivo(s) - {formatBytes(size)}.</p>
      </div>
    </Modal>
  );
}

export function LibraryPanel({ onExport, onInfo }: Props) {
  const [list, setList] = useState<RecordingRecord[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [cleanup, setCleanup] = useState(false);
  const dialogs = useDialogs();
  const toast = useToast();

  const load = useCallback(async () => {
    const l = await listRecordings();
    setList(l);
    setUsage(await storageUsage(l));
  }, []);
  useEffect(() => {
    void load();
    return getFeed().onLibrary(() => void load());
  }, [load]);
  useEffect(() => () => { if (playing) URL.revokeObjectURL(playing.url); }, [playing]);

  const togglePlay = (r: RecordingRecord) => {
    if (playing?.id === r.id) return setPlaying(null);
    setPlaying({ id: r.id, url: URL.createObjectURL(r.blob) });
  };
  const rename = async (r: RecordingRecord) => {
    const v = await dialogs.prompt({ title: 'Renombrar grabacion', label: 'Nuevo nombre (sin extension)', initial: r.name, validate: (x) => (x ? null : 'El nombre no puede estar vacio') });
    if (v === null) return;
    await updateRecording(r.id, { name: sanitizeFilename(v) });
    void load();
  };
  const remove = async (r: RecordingRecord) => {
    if (!(await dialogs.confirm({ title: 'Eliminar grabacion', danger: true, confirmLabel: 'Eliminar', message: <>Se eliminara <b>{r.name}.{r.ext}</b> de la biblioteca local ({formatBytes(r.size)}).</> }))) return;
    await deleteRecording(r.id);
    if (playing?.id === r.id) setPlaying(null);
    toast.push('info', 'Grabacion eliminada');
    void load();
  };
  const removeAll = async () => {
    if (!(await dialogs.confirm({ title: 'Vaciar biblioteca', danger: true, confirmLabel: 'Eliminar todo', message: `Se eliminaran ${list.length} grabaciones (${formatBytes(usage?.used ?? 0)}). No se puede deshacer.` }))) return;
    await clearRecordings();
    setPlaying(null);
    void load();
  };

  const pct = usage?.quota ? Math.min(100, ((usage.browserUsage ?? usage.used) / usage.quota) * 100) : 0;
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3">
        <SectionTitle icon={HardDrive} action={<div className="flex gap-1"><Button size="sm" variant="ghost" icon={Eraser} disabled={!list.length} onClick={() => setCleanup(true)}>Limpiar</Button><Button size="sm" variant="ghost" icon={Trash2} disabled={!list.length} onClick={() => void removeAll()}>Vaciar</Button></div>}>Espacio local</SectionTitle>
        <div className="mt-2 flex items-baseline justify-between text-sm">
          <span className="num font-semibold">{formatBytes(usage?.used ?? 0)}</span>
          <span className="text-faint">{usage?.count ?? 0} archivo(s){usage?.quota ? ` - cuota ${formatBytes(usage.quota)}` : ''}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface3"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, usage?.used ? 1 : 0)}%` }} /></div>
        <p className="mt-2 text-sm text-faint">Las grabaciones se guardan en IndexedDB de este navegador. Nunca salen de su equipo.</p>
      </Card>

      {!list.length ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line2 px-6 py-10 text-center">
          <FileAudio size={26} className="text-faint" />
          <p className="text-base font-medium">Aun no hay grabaciones</p>
          <p className="text-sm text-faint">Los segmentos aparecen aqui en cuanto finalizan.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id}>
              <Card className="p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold" id={`rec-${r.id}`}>{r.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-faint">
                      <span>{formatDateTime(r.startedAt)}</span><span className="num">{formatDuration(r.durationMs, true)}</span><span className="num">{formatBytes(r.size)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="primary">{r.ext}</Badge>
                      {r.kind === 'merged' ? <Badge tone="proc">Union</Badge> : null}
                      {r.kind === 'converted' ? <Badge tone="done">Convertido</Badge> : null}
                      <span className="truncate text-sm text-muted">{r.sourceDomain || r.sourceTitle}</span>
                    </div>
                  </div>
                </div>
                {playing?.id === r.id ? <audio className="mt-2 h-9 w-full" controls autoPlay src={playing.url} aria-labelledby={`rec-${r.id}`} onEnded={() => setPlaying(null)} onError={() => { toast.push('error', 'No se pudo reproducir este archivo'); setPlaying(null); }} /> : null}
                <div className="mt-2 flex items-center gap-0.5 border-t border-line pt-2">
                  <IconButton size="sm" icon={playing?.id === r.id ? Pause : Play} label={playing?.id === r.id ? 'Detener reproduccion' : 'Reproducir'} onClick={() => togglePlay(r)} />
                  <IconButton size="sm" icon={Download} label="Descargar / exportar" onClick={() => onExport(r, 'download')} />
                  <IconButton size="sm" icon={Repeat2} label="Convertir a otro formato" onClick={() => onExport(r, 'convert')} />
                  <IconButton size="sm" icon={Pencil} label="Renombrar" onClick={() => void rename(r)} />
                  <IconButton size="sm" icon={Info} label="Metadatos" onClick={() => onInfo(r)} />
                  <span className="flex-1" />
                  <IconButton size="sm" icon={Trash2} label="Eliminar" className="hover:text-danger" onClick={() => void remove(r)} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {cleanup ? <CleanupModal list={list} onClose={() => setCleanup(false)} onDone={() => void load()} /> : null}
    </div>
  );
}
