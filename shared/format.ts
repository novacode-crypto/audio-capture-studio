export function pad(n: number, w = 2): string {
  return String(Math.floor(n)).padStart(w, '0');
}

/** HH:MM:SS (o MM:SS) con decimas opcionales. */
export function formatDuration(ms: number, tenths = false): string {
  const total = Math.max(0, ms) / 1000;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const base = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return tenths ? `${base}.${Math.floor((total * 10) % 10)}` : base;
}

export function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const v = b / 1024 ** i;
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

export function formatDb(db: number | null | undefined): string {
  if (db === null || db === undefined || !Number.isFinite(db)) return '-inf dB';
  return `${db <= -99 ? '-inf' : db.toFixed(1)} dB`;
}

export function formatClock(ts: number | null): string {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatClock(ts)}`;
}

export function slugify(s: string, max = 40): string {
  const out = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return out || 'audio';
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function buildName(template: string, o: { page: string; ts: number; seg: number }): string {
  const d = new Date(o.ts);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const name = template
    .replace(/\{page\}/g, slugify(o.page))
    .replace(/\{date\}/g, date)
    .replace(/\{time\}/g, time)
    .replace(/\{seg\}/g, `seg${pad(o.seg, 3)}`);
  return sanitizeFilename(name);
}

export function sanitizeFilename(n: string): string {
  return n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120) || 'audio';
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function dbFromLinear(v: number): number {
  return v <= 1e-6 ? -120 : 20 * Math.log10(v);
}
