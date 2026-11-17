import { useMemo, useState } from 'react';
import { Download, Library, Lock } from 'lucide-react';
import { Modal, useDialogs } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Tip } from '../components/Tooltip';
import { Badge, Button, IndeterminateBar, Segmented, Select, Slider, TextField, Toggle, NumberField } from '../components/ui';
import { cn } from '../components/cn';
import { downloadBlob, effectiveBitrate, listFormats, runExport } from '../export/exporter';
import type { ServiceStatus } from '../export/service-client';
import { putRecording } from '../storage/db';
import { QUALITY_PRESETS, type AppSettings, type ExportSettings, type QualityId } from '../shared/settings';
import { formatBytes, uid } from '../shared/format';
import type { RecordingRecord } from '../shared/types';

interface Props {
  rec: RecordingRecord;
  mode: 'download' | 'convert';
  settings: AppSettings;
  update: (fn: (s: AppSettings) => AppSettings) => void;
  service: ServiceStatus | null;
  onClose: () => void;
}

const LOSSY = ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'webm'];

export function ExportModal({ rec, mode, settings, update, service, onClose }: Props) {
  const e = settings.export;
  const toast = useToast();
  const dialogs = useDialogs();
  const formats = useMemo(() => listFormats(rec, service?.ok ? service.info.formats : null), [rec, service]);
  const current = formats.find((f) => f.id === e.format && f.available) ?? formats[0];
  const [name, setName] = useState(rec.name);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ExportSettings>) => update((s) => ({ ...s, export: { ...s.export, ...patch } }));
  const native = current.id === 'native';
  const lossy = LOSSY.includes(current.id);

  const act = async (target: 'download' | 'library') => {
    setBusy(true);
    try {
      const out = await runExport(rec, current.id, e, name, settings);
      if (target === 'download') {
        await downloadBlob(out.blob, out.filename, e.saveAs);
        toast.push('success', `Exportacion terminada: ${out.filename} (${formatBytes(out.blob.size)})`);
      } else {
        const copy: RecordingRecord = { ...rec, id: uid(), name: name.trim() || rec.name, createdAt: Date.now(), mime: out.mime.split(';')[0], ext: out.ext, size: out.blob.size, blob: out.blob, kind: 'converted', bitrate: null };
        await putRecording(copy);
        new BroadcastChannel('acs-bus').postMessage({ k: 'library' });
        toast.push('success', `Conversion terminada: guardada en la biblioteca como ${out.ext.toUpperCase()} (${formatBytes(out.blob.size)})`);
      }
      onClose();
    } catch (err) {
      await dialogs.error({ title: 'No se pudo exportar', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" dismissable={!busy} title={mode === 'download' ? 'Exportar grabacion' : 'Convertir grabacion'}
      description={`${rec.name}.${rec.ext} - ${formatBytes(rec.size)}`}
      footer={busy ? <span className="text-sm text-muted">Procesando...</span> : (
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant={mode === 'convert' ? 'primary' : 'secondary'} icon={Library} disabled={native} onClick={() => void act('library')}>Convertir y guardar en biblioteca</Button>
          <Button variant={mode === 'download' ? 'primary' : 'secondary'} icon={Download} onClick={() => void act('download')}>Descargar</Button>
        </>
      )}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 text-base font-medium">Formato</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Formato de salida">
            {formats.map((f) => {
              const on = f.id === current.id;
              const b = (
                <button key={f.id} type="button" role="radio" aria-checked={on} disabled={!f.available || busy} onClick={() => set({ format: f.id })}
                  className={cn('flex w-full flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed', on ? 'border-primary bg-primarys' : 'border-line bg-surface hover:bg-surface3', !f.available && 'opacity-50 hover:bg-surface')}>
                  <span className={cn('text-base font-semibold', on && 'text-primary')}>{f.label}</span>
                  <span className="text-xs text-faint">{f.source === 'service' ? (f.available ? 'FFmpeg local' : 'No disponible') : f.source === 'local' ? 'Local, sin servicio' : 'Sin recodificar'}</span>
                </button>
              );
              return <Tip key={f.id} content={f.reason ?? (f.lossless ? 'Sin perdida de calidad' : f.label)} disabled={f.available && !f.lossless} className="flex">{b}</Tip>;
            })}
          </div>
          {!service?.ok ? <p className="mt-1.5 text-sm text-faint">Para MP3, FLAC, AAC, M4A, OGG y Opus inicie el servicio multimedia (start.bat) y vincule el token en Ajustes. Solo se muestran como disponibles los formatos que el servicio confirma.</p> : null}
        </div>

        {native ? (
          <div className="flex items-start gap-2 rounded-md border border-line bg-surface2 px-3 py-2 text-sm text-muted"><Lock size={15} className="mt-0.5 shrink-0" />El original se entrega sin modificar. Elija otro formato para aplicar calidad, ganancia o normalizacion.</div>
        ) : (
          <>
            {lossy || current.id === 'flac' ? (
              <div>
                <div className="mb-1 text-base font-medium">Calidad</div>
                <Segmented<QualityId> label="Perfil de calidad" value={e.quality} onChange={(quality) => set({ quality })}
                  options={[...(Object.keys(QUALITY_PRESETS) as Exclude<QualityId, 'custom'>[]).map((k) => ({ value: k as QualityId, label: QUALITY_PRESETS[k].label })), { value: 'custom' as QualityId, label: 'Otra' }]} />
                {lossy ? (
                  <div className="mt-2">
                    {e.quality === 'custom'
                      ? <NumberField label="Bitrate" min={32} max={512} step={16} unit="kbps" value={e.bitrate} onChange={(bitrate) => set({ bitrate })} className="w-44" />
                      : <p className="text-sm text-faint">Bitrate: {effectiveBitrate(e)} kbps</p>}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Select label="Frecuencia de muestreo" value={e.sampleRate} onChange={(ev) => set({ sampleRate: Number(ev.target.value) })}>
                <option value={0}>Origen (48 kHz)</option>
                {[16000, 22050, 32000, 44100, 48000].map((r) => <option key={r} value={r}>{r / 1000} kHz</option>)}
              </Select>
              <Select label="Canales" value={e.channels} onChange={(ev) => set({ channels: Number(ev.target.value) as 0 | 1 | 2 })} hint={rec.channels === 1 ? 'La fuente es mono' : undefined}>
                <option value={0}>Origen</option>
                <option value={1}>Mono</option>
                <option value={2}>Estereo</option>
              </Select>
            </div>
            <Slider label="Ganancia" min={-20} max={20} step={0.5} unit="dB" value={e.gainDb} onChange={(gainDb) => set({ gainDb })} />
            <Toggle label="Normalizar" hint={current.id === 'wav' ? 'Pico a -1 dBFS.' : 'Loudness a -16 LUFS (FFmpeg loudnorm).'} checked={e.normalize} onChange={(normalize) => set({ normalize })} />
            {current.source === 'service' ? <Toggle label="Incluir metadatos" hint="Titulo, dominio de origen, fecha y comentario." checked={e.metadata} onChange={(metadata) => set({ metadata })} /> : null}
          </>
        )}

        <TextField label="Nombre de archivo" value={name} onChange={setName} hint={`Se guardara como ${(name || 'audio').trim()}.${current.ext}`} />
        <Toggle label="Elegir destino al descargar" hint="Abre el dialogo del navegador para seleccionar carpeta y nombre." checked={e.saveAs} onChange={(saveAs) => set({ saveAs })} />
        {busy ? <div className="flex flex-col gap-1.5"><IndeterminateBar /><span className="text-sm text-muted">{current.source === 'service' ? 'Convirtiendo con FFmpeg local...' : 'Preparando archivo...'}</span></div> : null}
        {!busy && current.available && current.source !== 'native' ? <Badge tone="done" className="self-start">Procesamiento 100% local</Badge> : null}
      </div>
    </Modal>
  );
}
