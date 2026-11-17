// Valida el manifest MV3 y la ausencia de recursos remotos en la extension compilada.
import fs from 'node:fs';
import path from 'node:path';
import { EXT_DIST } from './lib/config.mjs';

const errors = [];
const warnings = [];
const mf = path.join(EXT_DIST, 'manifest.json');
if (!fs.existsSync(mf)) {
  console.error('No existe extension-dist/manifest.json. Ejecute build.bat');
  process.exit(1);
}
const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
if (m.manifest_version !== 3) errors.push('manifest_version debe ser 3');
for (const k of ['name', 'version', 'description']) if (!m[k]) errors.push(`Falta ${k}`);

const ALLOWED_PERMS = ['tabCapture', 'tabs', 'storage', 'offscreen', 'downloads', 'sidePanel', 'activeTab', 'unlimitedStorage', 'favicon', 'nativeMessaging'];
for (const p of m.permissions ?? []) if (!ALLOWED_PERMS.includes(p)) errors.push(`Permiso no previsto: ${p}`);
if ((m.permissions ?? []).includes('audioCapture') || (m.permissions ?? []).includes('microphone')) errors.push('No se permite microfono');

const files = [m.background?.service_worker, m.action?.default_popup, m.side_panel?.default_path, ...Object.values(m.icons ?? {}), ...Object.values(m.action?.default_icon ?? {}), 'offscreen.html', 'meter-processor.js', 'service-config.json'];
for (const f of files) if (f && !fs.existsSync(path.join(EXT_DIST, f))) errors.push(`Archivo referenciado inexistente: ${f}`);

const csp = m.content_security_policy?.extension_pages ?? '';
if (/unsafe-eval|https?:\/\/(?!127\.0\.0\.1|localhost)/.test(csp.replace(/img-src[^;]*;?/, ''))) errors.push('CSP con origenes remotos o unsafe-eval');

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}
const REMOTE = /(fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare|googletagmanager|google-analytics)/;
for (const f of walk(EXT_DIST)) {
  if (!/\.(js|html|css|json)$/.test(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  if (REMOTE.test(t)) errors.push(`Referencia remota/CDN en ${path.relative(EXT_DIST, f)}`);
}
const fonts = walk(EXT_DIST).filter((f) => f.endsWith('.woff2'));
if (!fonts.length) warnings.push('No se encontraron fuentes WOFF2 en la compilacion');

console.log(`Validacion MV3: ${errors.length ? 'ERRORES' : 'correcta'} (${fonts.length} fuentes WOFF2 locales)`);
for (const w of warnings) console.log('  AVISO: ' + w);
for (const e of errors) console.log('  ERROR: ' + e);
process.exit(errors.length ? 1 : 0);
