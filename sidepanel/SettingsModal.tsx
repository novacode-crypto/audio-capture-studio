import { useState } from 'react';
import { CheckCircle2, Plug, XCircle } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Badge, Button, KV, NumberField, Segmented, Slider, TextField } from '../components/ui';
import { resolveEndpoint, type ServiceStatus } from '../export/service-client';
import { buildName } from '../shared/format';
import type { AppSettings } from '../shared/settings';

interface Props {
  settings: AppSettings;
  update: (fn: (s: AppSettings) => AppSettings) => void;
  service: ServiceStatus | null;
  refresh: () => Promise<ServiceStatus>;
  onClose: () => void;
}

export function SettingsModal({ settings, update, service, refresh, onClose }: Props) {
  const [testing, setTesting] = useState(false);
  const [endpoint, setEndpoint] = useState<string>('');
  const [portText, setPortText] = useState(settings.service.portOverride ? String(settings.service.portOverride) : '');
  const preview = buildName(settings.export.template, { page: 'Mi pagina de ejemplo', ts: Date.now(), seg: 1 });

  const test = async () => {
    setTesting(true);
    try {
      const ep = await resolveEndpoint(settings.service.portOverride);
      setEndpoint(`${ep.origin} (${ep.source === 'ports.env' ? 'config/ports.env' : 'puerto manual'})`);
    } catch (e) {
      setEndpoint(e instanceof Error ? e.message : String(e));
    }
    await refresh();
    setTesting(false);
  };

  return (
    <Modal open onClose={onClose} size="lg" title="Configuracion" description="Las preferencias se guardan localmente en este navegador."
      footer={<Button onClick={onClose}>Listo</Button>}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-faint">Apariencia</h3>
          <Segmented<AppSettings['theme']> label="Tema" value={settings.theme} onChange={(theme) => update((s) => ({ ...s, theme }))}
            options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }, { value: 'system', label: 'Sistema' }]} />
          <Slider label="Retardo de los tooltips" min={0} max={1500} step={50} unit="ms" value={settings.ui.tooltipDelay} onChange={(v) => update((s) => ({ ...s, ui: { ...s.ui, tooltipDelay: v } }))} />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-faint">Nombres de archivo</h3>
          <TextField label="Plantilla" mono value={settings.export.template} onChange={(v) => update((s) => ({ ...s, export: { ...s.export, template: v || '{page}_{date}_{time}_{seg}' } }))}
            hint={`Variables: {page} {date} {time} {seg}. Ejemplo: ${preview}.webm`} />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-faint">Servicio multimedia (FFmpeg)</h3>
            {service?.ok ? <Badge tone="done"><CheckCircle2 size={11} />Conectado</Badge> : <Badge tone="silence"><XCircle size={11} />Sin conexion</Badge>}
          </div>
          <p className="text-sm text-muted">Opcional: la captura funciona sin el servicio. El puerto se toma de <span className="num">config/ports.env</span> (se copia a la extension al compilar o con configurar-puertos.bat).</p>
          <TextField label="Token de vinculacion" type="password" mono value={settings.service.token} onChange={(token) => update((s) => ({ ...s, service: { ...s.service, token: token.trim() } }))}
            hint="Se muestra al ejecutar start.bat y se guarda en data/service-token.txt." placeholder="Pegue aqui el token" />
          <NumberField label="Puerto manual (opcional)" min={0} max={65535} value={Number(portText) || 0}
            onChange={(n) => { setPortText(n ? String(n) : ''); update((s) => ({ ...s, service: { ...s.service, portOverride: n >= 1024 ? n : null } })); }} />
          <p className="-mt-2 text-sm text-faint">0 = usar el puerto de ports.env. Use este campo solo si cambio ports.env sin recompilar.</p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" icon={Plug} loading={testing} onClick={() => void test()}>Probar conexion</Button>
            {endpoint ? <span className="num min-w-0 truncate text-sm text-muted">{endpoint}</span> : null}
          </div>
          {service && !service.ok ? <p className="text-sm text-danger">{service.message}</p> : null}
          {service?.ok ? (
            <dl className="divide-y divide-line rounded-md border border-line bg-surface2 px-3">
              <KV k="Servicio" v={`v${service.info.version} - ${service.info.platform}`} />
              <KV k="FFmpeg" v={service.info.ffmpeg?.replace(/^ffmpeg version /, '').split(' ')[0] ?? 'no disponible'} />
              <KV k="FFprobe" v={service.info.ffprobe?.replace(/^ffprobe version /, '').split(' ')[0] ?? 'no disponible'} />
              <KV k="Formatos" v={service.info.formats.filter((f) => f.available).map((f) => f.id).join(', ')} />
              <KV k="Puertos (API / salud)" v={`${service.info.ports.api} / ${service.info.ports.health}`} />
            </dl>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
