import { useState } from 'react';
import { Ear, Gauge, Layers, Timer } from 'lucide-react';
import { Card, NumberField, Segmented, SectionTitle, Select, Slider, Toggle } from '../components/ui';
import { LevelMeter } from '../visualizers/LevelMeter';
import { PREBUFFER_OPTIONS, PROFILES, SILENCE_OPTIONS, type AppSettings } from '../shared/settings';
import type { DetectionSettings, ProfileId, SessionState } from '../shared/types';

function ChipChoice({ label, value, options, onChange, unit = 'ms', min, max, hint }: { label: string; value: number; options: number[]; onChange: (v: number) => void; unit?: string; min: number; max: number; hint?: string }) {
  const [custom, setCustom] = useState(!options.includes(value));
  const isCustom = custom || !options.includes(value);
  return (
    <div>
      <div className="mb-1 text-base font-medium">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => { setCustom(false); onChange(o); }}
            className={`num rounded-md border px-2 py-1 text-sm transition-colors ${!isCustom && o === value ? 'border-primaryl bg-primarys font-semibold text-primary' : 'border-line bg-surface text-muted hover:bg-surface3'}`}>
            {o >= 1000 ? `${o / 1000} s` : `${o} ${unit}`}
          </button>
        ))}
        <button type="button" onClick={() => setCustom(true)}
          className={`rounded-md border px-2 py-1 text-sm transition-colors ${isCustom ? 'border-primaryl bg-primarys font-semibold text-primary' : 'border-line bg-surface text-muted hover:bg-surface3'}`}>
          Personalizado
        </button>
      </div>
      {isCustom ? <NumberField className="mt-2 w-40" label="Valor" min={min} max={max} step={10} unit={unit} value={value} onChange={onChange} /> : null}
      {hint ? <p className="mt-1 text-sm text-faint">{hint}</p> : null}
    </div>
  );
}

export function DetectionPanel({ settings, update, session }: { settings: AppSettings; update: (fn: (s: AppSettings) => AppSettings) => void; session: SessionState }) {
  const d = settings.detection;
  const smart = settings.mode === 'smart';
  const setProfile = (p: ProfileId) =>
    update((s) => {
      if (p === 'custom') return { ...s, detection: { ...s.detection, profile: 'custom' } };
      const { label: _l, hint: _h, ...vals } = PROFILES[p];
      void _l; void _h;
      return { ...s, detection: { ...s.detection, ...vals, profile: p, sensitivity: 50 } };
    });
  const det = (patch: Partial<DetectionSettings>, custom = true) =>
    update((s) => {
      const next = { ...s.detection, ...patch };
      if (next.offDb > next.onDb - 3) {
        if ('onDb' in patch) next.offDb = next.onDb - 3;
        else next.onDb = next.offDb + 3;
      }
      return { ...s, detection: { ...next, profile: custom ? 'custom' : next.profile } };
    });
  const hint = d.profile === 'custom' ? 'Valores ajustados manualmente.' : PROFILES[d.profile].hint;

  return (
    <div className="flex flex-col gap-3">
      {!smart ? (
        <div className="rounded-md border border-primaryl bg-primarys px-3 py-2 text-sm text-primary">
          La deteccion automatica solo se aplica en modo Inteligente. En modo {settings.mode === 'manual' ? 'Manual' : 'Continuo'} se mantiene el analisis visual.
        </div>
      ) : null}
      <Card className="p-3">
        <SectionTitle icon={Ear}>Perfil de sensibilidad</SectionTitle>
        <div className="mt-2">
          <Segmented<ProfileId> label="Perfil" value={d.profile} onChange={setProfile}
            options={[{ value: 'voice', label: 'Voz' }, { value: 'music', label: 'Musica' }, { value: 'general', label: 'General' }, { value: 'custom', label: 'Custom' }]} />
        </div>
        <p className="mt-2 text-sm text-faint">{hint}</p>
        <div className="mt-3 rounded-md border border-line bg-surface2 p-2.5">
          <div className="mb-1 text-xs font-medium text-faint">{session.active ? 'Nivel en vivo con los umbrales actuales' : 'Inicie una sesion para ver el nivel en vivo'}</div>
          <LevelMeter />
        </div>
      </Card>

      <Card className="p-3">
        <SectionTitle icon={Gauge}>Umbrales (histeresis)</SectionTitle>
        <div className="mt-2 flex flex-col gap-3">
          <Slider label="Umbral de activacion" min={-80} max={-10} value={d.onDb} unit="dBFS" onChange={(v) => det({ onDb: v })} hint="Nivel que debe alcanzar el sonido para comenzar un segmento." />
          <Slider label="Umbral de silencio" min={-90} max={-13} value={d.offDb} unit="dBFS" onChange={(v) => det({ offDb: v })} hint="Por debajo de este nivel se considera silencio. Siempre al menos 3 dB bajo la activacion." />
          <Slider label="Sensibilidad" min={0} max={100} value={d.sensitivity} onChange={(v) => det({ sensitivity: v }, false)} format={(v) => (v === 50 ? 'Neutra' : v > 50 ? `+${v - 50}` : `${v - 50}`)} hint="Desplaza ambos umbrales: mas sensibilidad detecta sonidos mas debiles (0,3 dB por punto)." />
          <Slider label="Duracion minima de actividad" min={20} max={1000} step={10} value={d.minActivityMs} unit="ms" onChange={(v) => det({ minActivityMs: v })} hint="Descarta clics y ruidos breves." />
          <Toggle label="Umbral adaptativo" hint="Eleva la activacion sobre el ruido de fondo medido en reposo (+10 dB)." checked={d.adaptive} onChange={(v) => det({ adaptive: v }, false)} />
        </div>
      </Card>

      <Card className="p-3">
        <SectionTitle icon={Timer}>Tiempos</SectionTitle>
        <div className="mt-2 flex flex-col gap-4">
          <ChipChoice label="Silencio para finalizar" value={d.silenceMs} options={SILENCE_OPTIONS} min={100} max={30000} onChange={(v) => det({ silenceMs: v })} hint="Las pausas mas cortas no cortan el segmento." />
          <ChipChoice label="Pre-buffer" value={d.prebufferMs} options={PREBUFFER_OPTIONS} min={0} max={5000} onChange={(v) => det({ prebufferMs: v })}
            hint={session.recording ? 'Se aplicara al siguiente segmento.' : 'Audio previo al disparo que se conserva para no perder el ataque.'} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Filtro paso alto" min={10} max={2000} unit="Hz" value={d.hpHz} onChange={(v) => det({ hpHz: v })} />
            <NumberField label="Filtro paso bajo" min={500} max={22000} step={100} unit="Hz" value={d.lpHz} onChange={(v) => det({ lpHz: v })} />
          </div>
          <p className="-mt-2 text-sm text-faint">Los filtros solo afectan al analisis de deteccion, nunca al audio grabado.</p>
        </div>
      </Card>

      <Card className="p-3">
        <SectionTitle icon={Layers}>Segmentos y calidad de captura</SectionTitle>
        <div className="mt-2 flex flex-col gap-3">
          <Select label="Archivos de salida (modo inteligente)" value={settings.merge} onChange={(e) => update((s) => ({ ...s, merge: e.target.value as AppSettings['merge'] }))}
            hint="La union genera un WAV al finalizar la sesion (maximo 20 min de audio).">
            <option value="separate">Un archivo por segmento</option>
            <option value="merged">Unir todos los segmentos (sin conservar individuales)</option>
            <option value="both">Unir y conservar individuales</option>
          </Select>
          <Select label="Bitrate de grabacion (Opus)" value={settings.capture.bitrate} onChange={(e) => update((s) => ({ ...s, capture: { ...s.capture, bitrate: Number(e.target.value) } }))}>
            {[64000, 96000, 128000, 192000, 256000, 320000].map((b) => <option key={b} value={b}>{b / 1000} kbps</option>)}
          </Select>
          <Toggle label="Seguir escuchando la pestana" hint="Tab capture silencia la pestana; se reenvia el audio para que siga oyendola." checked={settings.capture.passthrough} onChange={(v) => update((s) => ({ ...s, capture: { ...s.capture, passthrough: v } }))} />
        </div>
      </Card>
    </div>
  );
}
