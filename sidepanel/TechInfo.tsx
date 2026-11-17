import { KV } from '../components/ui';
import { MODE_LABEL } from '../components/CaptureControls';
import { PHASE_META } from '../shared/session-ui';
import { formatBytes, formatDb, formatDuration } from '../shared/format';
import { PROFILES, type AppSettings } from '../shared/settings';
import { supportedRecorderMimes } from '../recording/segment-recorder';
import type { SessionState, VizFrame } from '../shared/types';

const dash = '-';
const kbps = (b: number | null) => (b ? `${Math.round(b / 1000)} kbps` : dash);

export function TechInfo({ session, settings, frame, full }: { session: SessionState; settings: AppSettings; frame: VizFrame | null; full?: boolean }) {
  const d = settings.detection;
  const t = session.tech;
  const mimes = supportedRecorderMimes();
  const profile = d.profile === 'custom' ? 'Personalizado' : PROFILES[d.profile].label;
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint"><span className="h-1.5 w-1.5 rounded-full bg-done" />Detectado</h4>
        <dl className="divide-y divide-line">
          <KV k="Estado de captura" mono={false} v={PHASE_META[session.phase].label} />
          <KV k="Pestana de origen" mono={false} v={session.tab?.title || dash} />
          <KV k="Dominio" v={session.tab?.domain || dash} />
          <KV k="Frecuencia de muestreo" v={t.sampleRate ? `${t.sampleRate} Hz` : dash} />
          <KV k="Canales de origen" v={t.channels ?? 'n/d'} />
          <KV k="RMS" v={frame ? formatDb(frame.rmsDb) : dash} />
          <KV k="Pico" v={frame ? formatDb(frame.peakDb) : dash} />
          {full ? <KV k="Latencia base del audio" v={t.baseLatencyMs !== null ? `${t.baseLatencyMs.toFixed(1)} ms` : dash} /> : null}
          <KV k="Bitrate medio (ultimo segmento)" v={kbps(t.measuredBitrate)} />
        </dl>
      </div>
      <div>
        <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Configurado</h4>
        <dl className="divide-y divide-line">
          <KV k="MIME type" v={t.mime ?? mimes[0]?.split(';')[0] ?? dash} />
          <KV k="Codec" v={t.codec ?? mimes[0]?.split('codecs=')[1] ?? dash} />
          <KV k="Bitrate solicitado" v={kbps(t.configuredBitrate ?? settings.capture.bitrate)} />
          <KV k="Modo" mono={false} v={MODE_LABEL[session.mode ?? settings.mode]} />
          {settings.mode === 'smart' || session.mode === 'smart' ? (
            <>
              <KV k="Perfil de deteccion" mono={false} v={profile} />
              <KV k="Umbral activacion / silencio" v={frame ? `${frame.onDb.toFixed(1)} / ${frame.offDb.toFixed(1)} dB` : `${d.onDb} / ${d.offDb} dB`} />
              <KV k="Silencio sostenido" v={`${d.silenceMs} ms`} />
              <KV k="Pre-buffer" v={`${d.prebufferMs} ms`} />
            </>
          ) : null}
        </dl>
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Sesion</h4>
        <dl className="divide-y divide-line">
          <KV k="Segmentos" v={session.segments} />
          <KV k="Duracion grabada" v={formatDuration(session.audioTotalMs, true)} />
          <KV k="Tamano acumulado" v={formatBytes(session.totalBytes)} />
        </dl>
      </div>
      {full ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Formatos de grabacion que ofrece este navegador</h4>
          <ul className="num space-y-0.5 text-sm text-muted">
            {mimes.length ? mimes.map((m) => <li key={m}>{m}</li>) : <li>Ninguno</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
