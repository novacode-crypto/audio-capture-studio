// Limpia temporales y compilaciones regenerables. NUNCA toca config/, data/ ni grabaciones.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, RUNTIME_DIR, readPidFile, pidAlive } from './lib/config.mjs';

const info = readPidFile();
const running = info && pidAlive(info.pid);
const targets = ['extension-dist', 'dist', 'release', path.join('node_modules', '.vite'), path.join('runtime', 'tmp'), path.join('runtime', 'shots'), path.join('runtime', 'detector.test.bundle.mjs')];
if (!running) targets.push(path.join('runtime', 'service.log'));
for (const t of targets) {
  const p = path.join(ROOT, t);
  if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log('  eliminado: ' + t); }
}
if (running) console.log('  conservado runtime/service.log (el servicio esta en ejecucion)');
fs.mkdirSync(path.join(RUNTIME_DIR), { recursive: true });
console.log('Conservados: config/ports.env, config/app.env, data/ (token) y la biblioteca de grabaciones (vive en el navegador).');
