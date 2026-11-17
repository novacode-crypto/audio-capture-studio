import { useState } from 'react';
import { Modal } from '../components/Modal';
import { Button, KV, Spinner } from '../components/ui';
import { serviceProbe, type ServiceStatus } from '../export/service-client';
import { formatBytes, formatDateTime, formatDb, formatDuration } from '../shared/format';
import { useLevels } from '../shared/hooks';
import type { AppSettings } from '../shared/settings';
import type { RecordingRecord, SessionState } from '../shared/types';
import { TechInfo } from './TechInfo';

export function TechModal({ session, settings, onClose }: { session: SessionState; settings: AppSettings; onClose: () => void }) {
  const frame = useLevels(session.active);
  return (
    <Modal open onClose={onClose} size="md" title="Informacion tecnica" description="Se distinguen los datos detectados en la captura de los valores configurados." footer={<Button onClick={onClose}>Cerrar</Button>}>
      <TechInfo session={session} settings={settings} frame={frame} full />
    </Modal>
  );
}

export function RecordingInfoModal({ rec, settings, service, onClose }: { rec: RecordingRecord; settings: AppSettings; service: ServiceStatus | null; onClose: () => void }) {
  const [probe, setProbe] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setProbe(await serviceProbe(rec.blob, settings));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const stream = (probe?.streams as Record<string, unknown>[] | undefined)?.[0];
  const format = probe?.format as Record<string, unknown> | undefined;
  const dash = '-';
  return (
    <Modal open onClose={onClose} size="md" title="Metadatos" description={`${rec.name}.${rec.ext}`} footer={<Button onClick={onClose}>Cerrar</Button>}>
      <dl className="divide-y divide-line">
        <KV k="Nombre" mono={false} v={rec.name} />
        <KV k="Tipo" mono={false} v={rec.kind === 'segment' ? 'Segmento' : rec.kind === 'merged' ? 'Union de segmentos' : 'Conversion'} />
        <KV k="Inicio" v={formatDateTime(rec.startedAt)} />
        <KV k="Fin" v={formatDateTime(rec.endedAt)} />
        <KV k="Duracion (cronometrada)" v={formatDuration(rec.durationMs, true)} />
        <KV k="MIME" v={rec.mime} />
        <KV k="Tamano" v={`${formatBytes(rec.size)} (${rec.size} B)`} />
        <KV k="Bitrate medio" v={rec.bitrate ? `${Math.round(rec.bitrate / 1000)} kbps` : dash} />
        <KV k="Frecuencia / canales" v={`${rec.sampleRate ?? dash} Hz / ${rec.channels ?? dash}`} />
        <KV k="RMS / pico medidos" v={`${formatDb(rec.rmsDb)} / ${formatDb(rec.peakDb)}`} />
        <KV k="Pestana de origen" mono={false} v={rec.sourceTitle || dash} />
        <KV k="Dominio" v={rec.sourceDomain || dash} />
        <KV k="Modo de captura" mono={false} v={rec.mode} />
      </dl>
      <div className="mt-4 rounded-md border border-line bg-surface2 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-base font-semibold">Verificacion con FFprobe</span>
          <Button size="sm" variant="secondary" disabled={!service?.ok || busy} onClick={() => void run()}>Analizar archivo</Button>
        </div>
        {!service?.ok ? <p className="text-sm text-faint">Requiere el servicio multimedia conectado.</p> : null}
        {busy ? <Spinner label="Analizando..." /> : null}
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        {probe ? (
          <dl className="divide-y divide-line">
            <KV k="Contenedor" v={String(format?.format_name ?? dash)} />
            <KV k="Codec" v={String(stream?.codec_name ?? dash)} />
            <KV k="Frecuencia" v={`${String(stream?.sample_rate ?? dash)} Hz`} />
            <KV k="Canales" v={String(stream?.channels ?? dash)} />
            <KV k="Duracion" v={format?.duration ? `${Number(format.duration).toFixed(2)} s` : 'no declarada'} />
            <KV k="Bitrate" v={format?.bit_rate ? `${Math.round(Number(format.bit_rate) / 1000)} kbps` : dash} />
          </dl>
        ) : null}
      </div>
    </Modal>
  );
}
