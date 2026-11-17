// Servicio multimedia local de AUDIO CAPTURE STUDIO (FFmpeg + FFprobe).
// - Solo escucha en loopback.  - Puertos leidos EXCLUSIVAMENTE de config/ports.env.
// - Autenticacion por token (Bearer).  - Validacion de Host y Origin.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import {
  ROOT, RUNTIME_DIR, DATA_DIR, PID_FILE, readPorts, readAppEnv, loopbackHost,
} from '../scripts/lib/config.mjs';
import { resolveMediaBinaries } from '../scripts/lib/media-binaries.mjs';
const VERSION = '1.0.0';
const app = readAppEnv();
const { values: ports, errors } = readPorts();
if (errors.length) {
  console.error('ports.env no valido:\n - ' + errors.join('\n - '));
  process.exit(1);
}
const HOST = loopbackHost(app);
const MAIN_PORT = ports.PORT_MULTIMEDIA;
const HEALTH_PORT = ports.PORT_HEALTH;
const MAX_UPLOAD = Math.max(1, Number(app.MAX_UPLOAD_MB || 512)) * 1024 * 1024;
const TMP_MAX_AGE = Math.max(1, Number(app.TEMP_MAX_AGE_MIN || 60)) * 60_000;
const LEVELS = { error: 0, info: 1, debug: 2 };
const LEVEL = LEVELS[app.LOG_LEVEL] ?? 1;
const ALLOWED_IDS = (app.ALLOWED_EXTENSION_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const TMP_DIR = path.join(RUNTIME_DIR, 'tmp');
const TOKEN_FILE = path.join(DATA_DIR, 'service-token.txt');

const log = (lvl, ...a) => LEVELS[lvl] <= LEVEL && console.log(new Date().toISOString(), `[${lvl}]`, ...a);

const MEDIA_BINARIES = resolveMediaBinaries(app);
const FFMPEG = MEDIA_BINARIES.ffmpeg;
const FFPROBE = MEDIA_BINARIES.ffprobe;

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(RUNTIME_DIR, { recursive: true });

// ---------------------------------------------------------------- token
function loadToken() {
  const rotate = String(app.TOKEN_ROTATE_ON_START).toLowerCase() === 'true';
  if (!rotate && fs.existsSync(TOKEN_FILE)) {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t.length >= 24) return t;
  }
  const t = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(TOKEN_FILE, t + '\n', { mode: 0o600 });
  return t;
}
const TOKEN = loadToken();
const TOKEN_BUF = Buffer.from(TOKEN);

function tokenOk(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) return false;
  const given = Buffer.from(m[1]);
  return given.length === TOKEN_BUF.length && crypto.timingSafeEqual(given, TOKEN_BUF);
}

// ---------------------------------------------------------------- formatos
const OPUS_RATES = [8000, 12000, 16000, 24000, 48000];
const FORMATS = {
  mp3: { label: 'MP3', ext: 'mp3', mime: 'audio/mpeg', need: 'libmp3lame', args: (o) => ['-c:a', 'libmp3lame', '-b:a', `${o.bitrate}k`, '-f', 'mp3'] },
  flac: { label: 'FLAC', ext: 'flac', mime: 'audio/flac', need: 'flac', args: (o) => ['-c:a', 'flac', '-compression_level', String(o.flacLevel), '-f', 'flac'] },
  aac: { label: 'AAC (ADTS)', ext: 'aac', mime: 'audio/aac', need: 'aac', args: (o) => ['-c:a', 'aac', '-b:a', `${o.bitrate}k`, '-f', 'adts'] },
  m4a: { label: 'M4A (AAC)', ext: 'm4a', mime: 'audio/mp4', need: 'aac', args: (o) => ['-c:a', 'aac', '-b:a', `${o.bitrate}k`, '-movflags', '+faststart', '-f', 'ipod'] },
  ogg: { label: 'OGG (Vorbis)', ext: 'ogg', mime: 'audio/ogg', need: 'libvorbis', args: (o) => ['-c:a', 'libvorbis', '-b:a', `${o.bitrate}k`, '-f', 'ogg'] },
  opus: { label: 'Opus', ext: 'opus', mime: 'audio/ogg; codecs=opus', need: 'libopus', opus: true, args: (o) => ['-c:a', 'libopus', '-b:a', `${o.bitrate}k`, '-f', 'ogg'] },
  webm: { label: 'WebM (Opus)', ext: 'webm', mime: 'audio/webm', need: 'libopus', opus: true, args: (o) => ['-c:a', 'libopus', '-b:a', `${o.bitrate}k`, '-f', 'webm'] },
  wav: { label: 'WAV (PCM 16 bit)', ext: 'wav', mime: 'audio/wav', need: 'pcm_s16le', args: () => ['-c:a', 'pcm_s16le', '-f', 'wav'] },
};
let encoders = new Set();
let ffmpegVersion = null;
let ffprobeVersion = null;

function exec(bin, args) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 20_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) =>
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }),
    );
  });
}

async function detectCapabilities() {
  if (FFMPEG) {
    const v = await exec(FFMPEG, ['-version']);
    ffmpegVersion = v.err ? null : v.stdout.split('\n')[0].trim();
    const e = await exec(FFMPEG, ['-hide_banner', '-encoders']);
    encoders = new Set(
      e.stdout.split('\n').map((l) => /^\s[A-Z.]{6}\s(\S+)/.exec(l)?.[1]).filter(Boolean),
    );
  }
  if (FFPROBE) {
    const v = await exec(FFPROBE, ['-version']);
    ffprobeVersion = v.err ? null : v.stdout.split('\n')[0].trim();
  }
}

function formatList() {
  return Object.entries(FORMATS).map(([id, f]) => ({
    id, label: f.label, ext: f.ext, mime: f.mime, available: Boolean(ffmpegVersion) && encoders.has(f.need),
  }));
}

// ---------------------------------------------------------------- utilidades HTTP
function allowedOrigin(origin) {
  if (!origin) return true; // clientes sin Origin (CLI): igualmente requieren token
  const m = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
  if (!m) return false;
  return ALLOWED_IDS.length === 0 || ALLOWED_IDS.includes(m[1]);
}
function hostOk(req, port) {
  const h = (req.headers.host || '').toLowerCase();
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(h);
}
function cors(req, res) {
  const o = req.headers.origin;
  if (o && allowedOrigin(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'X-Output-Ext, X-Output-Mime, X-Encode-Ms');
  }
}
function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
const fail = (res, status, code, message) => json(res, status, { ok: false, error: { code, message } });

function saveBody(req, dest) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const out = fs.createWriteStream(dest);
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_UPLOAD) {
        req.destroy();
        out.destroy();
        reject(Object.assign(new Error('Archivo demasiado grande'), { status: 413, code: 'too_large' }));
      }
    });
    req.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => resolve(size));
    req.pipe(out);
  });
}
const rm = (...files) => files.forEach((f) => fs.promises.unlink(f).catch(() => {}));

function num(v, def, min, max, int = true) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw Object.assign(new Error(`Parametro fuera de rango (${min}-${max})`), { status: 400, code: 'bad_param' });
  return int ? Math.round(n) : n;
}
const SAMPLE_RATES = [0, 8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000];

function parseOptions(url) {
  const q = url.searchParams;
  const format = q.get('format') || '';
  if (!(format in FORMATS)) throw Object.assign(new Error('Formato no soportado'), { status: 400, code: 'bad_format' });
  const sampleRate = num(q.get('sampleRate'), 0, 0, 96000);
  if (!SAMPLE_RATES.includes(sampleRate)) throw Object.assign(new Error('Frecuencia de muestreo no valida'), { status: 400, code: 'bad_param' });
  const meta = {};
  for (const k of ['title', 'artist', 'album', 'comment', 'date', 'genre']) {
    const v = q.get(k);
    if (v) meta[k] = v.replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);
  }
  return {
    format,
    bitrate: num(q.get('bitrate'), 192, 16, 512),
    sampleRate,
    channels: num(q.get('channels'), 0, 0, 2),
    gain: num(q.get('gain'), 0, -30, 30, false),
    normalize: q.get('normalize') === '1',
    flacLevel: num(q.get('flacLevel'), 5, 0, 12),
    meta,
  };
}

function buildArgs(o, input, output) {
  const f = FORMATS[o.format];
  const args = ['-hide_banner', '-nostdin', '-y', '-i', input, '-vn', '-map_metadata', '-1'];
  const filters = [];
  if (o.gain !== 0) filters.push(`volume=${o.gain}dB`);
  if (o.normalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  if (filters.length) args.push('-af', filters.join(','));
  let sr = o.sampleRate;
  if (f.opus && !OPUS_RATES.includes(sr)) sr = 48000;
  if (o.normalize && !sr) sr = 48000; // loudnorm devuelve 192 kHz si no se fija
  if (sr) args.push('-ar', String(sr));
  if (o.channels) args.push('-ac', String(o.channels));
  args.push(...f.args(o));
  for (const [k, v] of Object.entries(o.meta)) args.push('-metadata', `${k}=${v}`);
  args.push(output);
  return args;
}

let busy = 0;
const MAX_JOBS = 2;

async function handleConvert(req, res, url) {
  const o = parseOptions(url);
  const f = FORMATS[o.format];
  if (!FFMPEG || !ffmpegVersion) return fail(res, 503, 'no_ffmpeg', 'FFmpeg no disponible. Ejecute install.bat');
  if (!encoders.has(f.need)) return fail(res, 422, 'no_encoder', `Este FFmpeg no incluye el codificador ${f.need}`);
  if (busy >= MAX_JOBS) return fail(res, 429, 'busy', 'Servicio ocupado: demasiadas conversiones simultaneas');
  busy++;
  const id = crypto.randomBytes(8).toString('hex');
  const input = path.join(TMP_DIR, `in-${id}`);
  const output = path.join(TMP_DIR, `out-${id}.${f.ext}`);
  const t0 = Date.now();
  try {
    await saveBody(req, input);
    const args = buildArgs(o, input, output);
    log('debug', 'ffmpeg', args.join(' '));
    const r = await new Promise((resolve) => {
      const p = spawn(FFMPEG, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
      const timer = setTimeout(() => p.kill('SIGKILL'), 15 * 60_000);
      p.on('close', (code) => { clearTimeout(timer); resolve({ code, err }); });
      p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, err: String(e) }); });
    });
    if (r.code !== 0) {
      log('error', 'ffmpeg fallo', r.err.split('\n').slice(-3).join(' | '));
      rm(input, output);
      return fail(res, 422, 'ffmpeg_failed', 'FFmpeg no pudo convertir el audio: ' + (r.err.trim().split('\n').pop() || 'error desconocido'));
    }
    const st = await fs.promises.stat(output);
    res.writeHead(200, {
      'Content-Type': f.mime, 'Content-Length': st.size, 'Cache-Control': 'no-store',
      'X-Output-Ext': f.ext, 'X-Output-Mime': f.mime, 'X-Encode-Ms': String(Date.now() - t0),
    });
    const s = fs.createReadStream(output);
    s.pipe(res);
    res.on('close', () => { s.destroy(); rm(input, output); });
  } catch (e) {
    rm(input, output);
    if (!res.headersSent) fail(res, e.status || 500, e.code || 'internal', e.message);
    else res.destroy();
  } finally {
    busy--;
  }
}

async function handleProbe(req, res) {
  if (!FFPROBE || !ffprobeVersion) return fail(res, 503, 'no_ffprobe', 'FFprobe no disponible. Ejecute install.bat');
  const input = path.join(TMP_DIR, `probe-${crypto.randomBytes(8).toString('hex')}`);
  try {
    await saveBody(req, input);
    const r = await exec(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input]);
    if (r.err) return fail(res, 422, 'probe_failed', 'Archivo no valido o ilegible: ' + (r.stderr.trim().split('\n').pop() || ''));
    let data = {};
    try { data = JSON.parse(r.stdout); } catch { /* vacio */ }
    json(res, 200, { ok: true, probe: data });
  } catch (e) {
    fail(res, e.status || 500, e.code || 'internal', e.message);
  } finally {
    rm(input);
  }
}

// ---------------------------------------------------------------- servidores
const startedAt = Date.now();
const health = () => ({ ok: true, service: 'audio-capture-studio-multimedia', version: VERSION, pid: process.pid, uptimeSec: Math.round((Date.now() - startedAt) / 1000), ffmpeg: Boolean(ffmpegVersion), ffprobe: Boolean(ffprobeVersion) });

const mainServer = http.createServer(async (req, res) => {
  try {
    if (!hostOk(req, MAIN_PORT)) return fail(res, 403, 'bad_host', 'Host no permitido');
    if (!allowedOrigin(req.headers.origin)) return fail(res, 403, 'bad_origin', 'Origen no permitido');
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url || '/', `http://${HOST}:${MAIN_PORT}`);
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, health());
    if (!tokenOk(req)) return fail(res, 401, 'unauthorized', 'Token ausente o incorrecto');
    if (req.method === 'GET' && url.pathname === '/v1/info') {
      return json(res, 200, {
        ok: true, version: VERSION, ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion, platform: `${os.platform()} ${os.arch()}`,
        maxUploadMB: MAX_UPLOAD / 1024 / 1024, formats: formatList(), ports: { api: MAIN_PORT, health: HEALTH_PORT },
      });
    }
    if (req.method === 'POST' && url.pathname === '/v1/convert') return await handleConvert(req, res, url);
    if (req.method === 'POST' && url.pathname === '/v1/probe') return await handleProbe(req, res);
    if (req.method === 'POST' && url.pathname === '/v1/shutdown') {
      json(res, 200, { ok: true });
      setTimeout(() => shutdown('solicitud /v1/shutdown'), 100);
      return;
    }
    return fail(res, 404, 'not_found', 'Ruta no encontrada');
  } catch (e) {
    if (!res.headersSent) {
      if (e.status) return fail(res, e.status, e.code || 'bad_request', e.message);
      log('error', e);
      fail(res, 500, 'internal', 'Error interno');
    }
  }
});
mainServer.requestTimeout = 20 * 60_000;

const healthServer = http.createServer((req, res) => {
  if (!hostOk(req, HEALTH_PORT)) return fail(res, 403, 'bad_host', 'Host no permitido');
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) return json(res, 200, health());
  return fail(res, 404, 'not_found', 'Solo /health');
});

function listen(server, port, name) {
  return new Promise((resolve, reject) => {
    server.once('error', (e) => reject(Object.assign(e, { portName: name, port })));
    server.listen(port, HOST === 'localhost' ? '127.0.0.1' : HOST, resolve);
  });
}

function cleanTmp() {
  const now = Date.now();
  for (const f of fs.readdirSync(TMP_DIR)) {
    const p = path.join(TMP_DIR, f);
    try { if (now - fs.statSync(p).mtimeMs > TMP_MAX_AGE) fs.unlinkSync(p); } catch { /* ignorar */ }
  }
}

let closing = false;
function shutdown(reason) {
  if (closing) return;
  closing = true;
  log('info', `Deteniendo servicio (${reason})`);
  mainServer.close();
  healthServer.close();
  clearInterval(cleaner);
  for (const f of fs.readdirSync(TMP_DIR)) rm(path.join(TMP_DIR, f));
  try { fs.unlinkSync(PID_FILE); } catch { /* ya no existe */ }
  setTimeout(() => process.exit(0), 300).unref();
}
const cleaner = setInterval(cleanTmp, 10 * 60_000);
cleaner.unref();
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  for (const f of fs.readdirSync(TMP_DIR)) rm(path.join(TMP_DIR, f));
  await detectCapabilities();
  await listen(mainServer, MAIN_PORT, 'PORT_MULTIMEDIA');
  await listen(healthServer, HEALTH_PORT, 'PORT_HEALTH');
  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: process.pid, port: MAIN_PORT, healthPort: HEALTH_PORT, host: HOST, startedAt, root: ROOT }));
  log('info', `Servicio multimedia v${VERSION} en http://${HOST}:${MAIN_PORT} (salud: ${HEALTH_PORT}) PID ${process.pid}`);
  log('info', `FFmpeg: ${ffmpegVersion ?? 'NO DISPONIBLE'} | FFprobe: ${ffprobeVersion ?? 'NO DISPONIBLE'}`);
  log('info', `Formatos: ${formatList().filter((f) => f.available).map((f) => f.id).join(', ') || 'ninguno'}`);
} catch (e) {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${e.port} (${e.portName}) ya esta en uso. Modifique config/ports.env`);
    process.exit(3);
  }
  console.error('No se pudo iniciar el servicio:', e);
  process.exit(1);
}
