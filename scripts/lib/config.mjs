// Lectura y validacion centralizada de la configuracion local.
// NO contiene numeros de puerto: la fuente unica es config/ports.env
// (y config/ports.defaults.env para restaurar valores de fabrica).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PORTS_FILE = path.join(ROOT, 'config', 'ports.env');
export const PORTS_DEFAULTS_FILE = path.join(ROOT, 'config', 'ports.defaults.env');
export const APP_FILE = path.join(ROOT, 'config', 'app.env');
export const RUNTIME_DIR = path.join(ROOT, 'runtime');
export const DATA_DIR = path.join(ROOT, 'data');
export const PID_FILE = path.join(RUNTIME_DIR, 'service.pid.json');
export const EXT_DIST = path.join(ROOT, 'extension-dist');

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}

export function readEnvFile(file) {
  if (!fs.existsSync(file)) return null;
  return parseEnv(fs.readFileSync(file, 'utf8'));
}

export function readAppEnv() {
  return readEnvFile(APP_FILE) ?? {};
}

/** Lee ports.env. Devuelve { values, errors } con validacion completa de estructura. */
export function readPorts() {
  const errors = [];
  const defaults = readEnvFile(PORTS_DEFAULTS_FILE);
  if (!defaults) errors.push(`Falta config/ports.defaults.env (${PORTS_DEFAULTS_FILE})`);
  const raw = readEnvFile(PORTS_FILE);
  if (!raw) errors.push(`Falta config/ports.env (${PORTS_FILE})`);
  const keys = Object.keys(defaults ?? {});
  const values = {};
  for (const key of keys) {
    const v = raw?.[key];
    if (v === undefined || v === '') {
      if (raw) errors.push(`Falta la variable obligatoria ${key} en config/ports.env`);
      continue;
    }
    if (!/^\d+$/.test(v)) {
      errors.push(`${key}="${v}" no es un numero entero`);
      continue;
    }
    const n = Number(v);
    if (n < 1024 || n > 65535) {
      errors.push(`${key}=${n} fuera del rango permitido (1024-65535)`);
      continue;
    }
    values[key] = n;
  }
  const seen = new Map();
  for (const [k, n] of Object.entries(values)) {
    if (seen.has(n)) errors.push(`Puerto duplicado ${n}: ${seen.get(n)} y ${k} deben ser distintos`);
    else seen.set(n, k);
  }
  return { values, errors, keys };
}

export function loopbackHost(appEnv) {
  const h = (appEnv.SERVICE_HOST || '127.0.0.1').trim();
  if (!['127.0.0.1', '::1', 'localhost'].includes(h)) {
    throw new Error(`SERVICE_HOST="${h}" no permitido: solo loopback (127.0.0.1, ::1, localhost)`);
  }
  return h;
}

export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  } catch {
    return '';
  }
}

/** Intenta identificar PID y nombre del proceso que escucha en un puerto. */
export function findPortOwner(port) {
  let pid = null;
  if (process.platform === 'win32') {
    for (const line of run('netstat', ['-ano', '-p', 'tcp']).split(/\r?\n/)) {
      const p = line.trim().split(/\s+/);
      if (p.length >= 5 && /LISTENING|ESCUCHANDO/i.test(p[3]) && p[1].endsWith(':' + port)) {
        pid = Number(p[4]);
        break;
      }
    }
    if (!pid) return null;
    const csv = run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).trim();
    const name = csv.startsWith('"') ? csv.split('","')[0].replace(/^"/, '') : 'desconocido';
    return { pid, name };
  }
  const ss = run('ss', ['-ltnpH', `sport = :${port}`]);
  const m = ss.match(/pid=(\d+)/);
  if (m) {
    pid = Number(m[1]);
  } else {
    const l = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).trim().split(/\s+/)[0];
    if (l) pid = Number(l);
  }
  if (!pid) return null;
  const name = run('ps', ['-p', String(pid), '-o', 'comm=']).trim() || 'desconocido';
  return { pid, name };
}

export function readPidFile() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

export async function httpGetJson(url, timeoutMs = 2000, headers = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch (e) {
    return { status: 0, body: null, error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

export function writeEnvValue(file, key, value) {
  const text = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, `${key}=${value}`) : text.trimEnd() + `\n${key}=${value}\n`;
  fs.writeFileSync(file, next);
}

export function log(msg = '') {
  console.log(msg);
}
