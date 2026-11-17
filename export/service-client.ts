// Cliente del servicio multimedia local (FFmpeg/FFprobe).
// El endpoint se descubre desde service-config.json (generado desde config/ports.env) y se valida.
import type { AppSettings } from '../shared/settings';

export interface ServiceFormat { id: string; label: string; ext: string; mime: string; available: boolean }
export interface ServiceInfo {
  version: string;
  ffmpeg: string | null;
  ffprobe: string | null;
  platform: string;
  maxUploadMB: number;
  formats: ServiceFormat[];
  ports: { api: number; health: number };
}

export type ServiceStatus =
  | { ok: true; info: ServiceInfo; endpoint: string }
  | { ok: false; reason: 'no-token' | 'bad-config' | 'unreachable' | 'unauthorized' | 'error'; message: string; endpoint?: string };

export interface Endpoint { host: string; port: number; healthPort: number; origin: string; source: 'ports.env' | 'manual' }

const validPort = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1024 && n <= 65535;

export async function resolveEndpoint(override: number | null): Promise<Endpoint> {
  const r = await fetch(chrome.runtime.getURL('service-config.json'), { cache: 'no-store' });
  if (!r.ok) throw new Error('No se encontro service-config.json en la extension. Ejecute build.bat o configurar-puertos.bat');
  const c = (await r.json()) as { host?: string; port?: unknown; healthPort?: unknown };
  const host = c.host ?? '';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('service-config.json: host no permitido (solo loopback)');
  if (!validPort(c.port) || !validPort(c.healthPort)) throw new Error('service-config.json: puertos invalidos (1024-65535)');
  const port = validPort(override) ? override : c.port;
  return { host, port, healthPort: c.healthPort, origin: `http://${host === '::1' ? '[::1]' : host}:${port}`, source: validPort(override) ? 'manual' : 'ports.env' };
}

async function call(settings: AppSettings, path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<Response> {
  const ep = await resolveEndpoint(settings.service.portOverride);
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(ep.origin + path, { ...init, signal: ctl.signal, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${settings.service.token}` } });
  } finally {
    window.clearTimeout(t);
  }
}

export async function getServiceStatus(settings: AppSettings): Promise<ServiceStatus> {
  let ep: Endpoint;
  try {
    ep = await resolveEndpoint(settings.service.portOverride);
  } catch (e) {
    return { ok: false, reason: 'bad-config', message: e instanceof Error ? e.message : String(e) };
  }
  if (!settings.service.token.trim()) return { ok: false, reason: 'no-token', message: 'Falta el token de vinculacion', endpoint: ep.origin };
  try {
    const r = await call(settings, '/v1/info');
    if (r.status === 401) return { ok: false, reason: 'unauthorized', message: 'Token incorrecto', endpoint: ep.origin };
    if (!r.ok) return { ok: false, reason: 'error', message: `El servicio respondio ${r.status}`, endpoint: ep.origin };
    const body = (await r.json()) as ServiceInfo & { ok: boolean };
    return { ok: true, info: body, endpoint: ep.origin };
  } catch {
    return { ok: false, reason: 'unreachable', message: `Servicio no disponible en ${ep.origin}. Ejecute start.bat (puertos en config/ports.env)`, endpoint: ep.origin };
  }
}

export interface ConvertParams {
  format: string;
  bitrate: number;
  sampleRate: number;
  channels: number;
  normalize: boolean;
  gainDb: number;
  flacLevel: number;
  meta: Record<string, string>;
}

export async function serviceConvert(blob: Blob, p: ConvertParams, settings: AppSettings): Promise<{ blob: Blob; ext: string; mime: string }> {
  const q = new URLSearchParams({
    format: p.format,
    bitrate: String(p.bitrate),
    sampleRate: String(p.sampleRate),
    channels: String(p.channels),
    normalize: p.normalize ? '1' : '0',
    gain: String(p.gainDb),
    flacLevel: String(p.flacLevel),
    ...p.meta,
  });
  const r = await call(settings, `/v1/convert?${q}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } }, 15 * 60_000);
  if (!r.ok) {
    let msg = `El servicio respondio ${r.status}`;
    try {
      msg = ((await r.json()) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      /* cuerpo no JSON */
    }
    throw new Error(msg);
  }
  const mime = r.headers.get('X-Output-Mime') ?? 'application/octet-stream';
  return { blob: new Blob([await r.arrayBuffer()], { type: mime }), ext: r.headers.get('X-Output-Ext') ?? 'bin', mime };
}

export async function serviceProbe(blob: Blob, settings: AppSettings): Promise<Record<string, unknown>> {
  const r = await call(settings, '/v1/probe', { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } }, 60_000);
  const body = (await r.json()) as { ok: boolean; probe?: Record<string, unknown>; error?: { message: string } };
  if (!r.ok || !body.ok) throw new Error(body.error?.message ?? `El servicio respondio ${r.status}`);
  return body.probe ?? {};
}
