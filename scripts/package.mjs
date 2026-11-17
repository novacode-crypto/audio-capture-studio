// Genera release/AudioCaptureStudio-<version>.zip limpio (sin node_modules, caches ni temporales) y verifica su integridad.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { ROOT, EXT_DIST } from './lib/config.mjs';

if (!fs.existsSync(path.join(EXT_DIST, 'manifest.json'))) {
  console.error('Falta extension-dist/. Ejecute build.bat primero.');
  process.exit(1);
}
const version = JSON.parse(fs.readFileSync(path.join(EXT_DIST, 'manifest.json'), 'utf8')).version;
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'release', 'runtime', 'data', '.git', '.vite', '.cache', 'src']);
const EXCLUDE_FILES = /(\.log|\.tmp|\.zip|\.DS_Store|Thumbs\.db|index\.html|vite\.config\.ts|tsconfig\.json)$/;

const zip = new AdmZip();
let count = 0;
function add(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (rel === '' && EXCLUDE_DIRS.has(e.name)) continue;
      if (EXCLUDE_DIRS.has(e.name) && e.name !== 'dist') continue;
      add(path.join(dir, e.name), path.posix.join(rel, e.name));
    } else if (!EXCLUDE_FILES.test(e.name)) {
      zip.addLocalFile(path.join(dir, e.name), rel, e.name);
      count++;
    }
  }
}
add(ROOT);
const out = path.join(ROOT, 'release', `AudioCaptureStudio-${version}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
zip.writeZip(out);

// Verificacion de integridad: releer y comprobar CRC de cada entrada
const check = new AdmZip(out);
let bad = 0;
for (const e of check.getEntries()) {
  if (e.isDirectory) continue;
  try { e.getData(); } catch { bad++; console.error('CRC invalido: ' + e.entryName); }
}
const names = check.getEntries().map((e) => e.entryName);
for (const must of ['config/ports.env', 'config/app.env', 'extension-dist/manifest.json', 'install.bat', 'start.bat', 'README.md']) {
  if (!names.includes(must)) { bad++; console.error('Falta en el ZIP: ' + must); }
}
if (names.some((n) => n.startsWith('node_modules/'))) { bad++; console.error('El ZIP contiene node_modules'); }
const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
console.log(`ZIP: ${out}\n  entradas: ${count}  tamano: ${fs.statSync(out).size} bytes\n  sha256: ${sha}\n  integridad: ${bad ? 'FALLO' : 'correcta'}`);
process.exit(bad ? 1 : 0);
