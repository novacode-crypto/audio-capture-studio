// Diagnostico completo del entorno local de AUDIO CAPTURE STUDIO.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ROOT, EXT_DIST, DATA_DIR, readPorts, readAppEnv, loopbackHost, isPortFree, findPortOwner, readPidFile, pidAlive, httpGetJson,
} from './lib/config.mjs';
import { resolveMediaBinaries } from './lib/media-binaries.mjs';
let problems = 0;
const ok = (m) => console.log(`  [OK]    ${m}`);
const warn = (m) => console.log(`  [AVISO] ${m}`);
const bad = (m) => { problems++; console.log(`  [ERROR] ${m}`); };
const run = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8', windowsHide: true, timeout: 15000 }).split(/\r?\n/)[0].trim(); } catch { return null; } };
const npmVersion = () => {
  if (process.platform === 'win32') {
    const v = run('cmd.exe', ['/d', '/s', '/c', 'npm -v']);
    if (v) return v;
  }
  return run('npm', ['-v']);
};

console.log('\n== Entorno ==');
const major = Number(process.versions.node.split('.')[0]);
major >= 18 ? ok(`Node.js ${process.version}`) : bad(`Node.js ${process.version} (se requiere 18 o superior)`);
const npmv = npmVersion();
npmv ? ok(`npm ${npmv}`) : bad('npm no disponible');

console.log('\n== FFmpeg / FFprobe ==');
const app = readAppEnv();
const media = resolveMediaBinaries(app);
for (const [name, bin, version, source] of [
  ['FFmpeg', media.ffmpeg, media.ffmpegVersion, media.ffmpegSource],
  ['FFprobe', media.ffprobe, media.ffprobeVersion, media.ffprobeSource],
]) {
  if (version) {
    ok(`${name}: ${version.replace(/^${name.toLowerCase()} version /i, '')}`);
    console.log(`          Ruta: ${bin}`);
    console.log(`          Origen: ${source}`);
  } else {
    warn(`${name} no disponible. Configure ${name.toUpperCase()}_PATH en config/app.env o instale FFmpeg.`);
  }
}
if (media.ffmpegVersion && media.ffprobeVersion) {
  ok('FFmpeg y FFprobe disponibles; deteccion centralizada correcta.');
} else {
  warn('La captura basica funciona sin el servicio multimedia; conversion y analisis avanzado pueden estar limitados.');
}

console.log('\n== Configuracion de puertos (config/ports.env) ==');
const { values, errors } = readPorts();
if (errors.length) errors.forEach(bad);
else {
  const host = loopbackHost(app).replace('localhost', '127.0.0.1');
  const info = readPidFile();
  const mine = info && pidAlive(info.pid) ? info : null;
  for (const [k, p] of Object.entries(values)) {
    ok(`${k}=${p}`);
    if (await isPortFree(p, host)) { ok(`  puerto ${p} libre`); continue; }
    if (mine && [mine.port, mine.healthPort].includes(p)) { ok(`  puerto ${p} en uso por el servicio propio (PID ${mine.pid})`); continue; }
    const o = findPortOwner(p);
    bad(`  puerto ${p} OCUPADO por ${o ? `PID ${o.pid} (${o.name})` : 'un proceso no identificado'}. Cambie ports.env`);
  }
  console.log('\n== Servicio multimedia ==');
  if (!mine) warn('Servicio detenido (start.bat para iniciarlo)');
  else {
    if (mine.port !== values.PORT_MULTIMEDIA || mine.healthPort !== values.PORT_HEALTH) warn(`ports.env cambio tras el arranque (en ejecucion ${mine.port}/${mine.healthPort}). Reinicie: stop.bat + start.bat`);
    const h = await httpGetJson(`http://${host}:${mine.healthPort}/health`);
    h.status === 200 ? ok(`Salud OK en el puerto ${mine.healthPort} (PID ${h.body?.pid})`) : bad(`Sin respuesta de salud en ${mine.healthPort}`);
    const tf = path.join(DATA_DIR, 'service-token.txt');
    if (fs.existsSync(tf)) {
      const r = await httpGetJson(`http://${host}:${mine.port}/v1/info`, 3000, { Authorization: `Bearer ${fs.readFileSync(tf, 'utf8').trim()}` });
      r.status === 200 ? ok(`API autenticada OK (formatos: ${r.body.formats.filter((f) => f.available).map((f) => f.id).join(', ')})`) : bad(`API respondio ${r.status}`);
    }
    const un = await httpGetJson(`http://${host}:${mine.port}/v1/info`);
    un.status === 401 ? ok('Sin token la API rechaza la solicitud (401)') : bad(`La API sin token respondio ${un.status}`);
  }
}

console.log('\n== Estructura ==');
for (const f of ['config/ports.env', 'config/ports.defaults.env', 'config/app.env', 'multimedia-service/server.mjs', 'extension/manifest.json', 'icons/logo.svg', 'audio-engine/meter-processor.js']) {
  fs.existsSync(path.join(ROOT, f)) ? ok(f) : bad(`Falta ${f}`);
}
for (const [label, rel] of [
  ['Figtree (dependencia local)', 'node_modules/@fontsource-variable/figtree/package.json'],
  ['JetBrains Mono (dependencia local)', 'node_modules/@fontsource-variable/jetbrains-mono/package.json'],
]) {
  fs.existsSync(path.join(ROOT, rel)) ? ok(label) : warn(`${label} no instalada; ejecute install.bat`);
}
if (fs.existsSync(EXT_DIST)) {
  ok('extension-dist/ compilada');
  const sc = path.join(EXT_DIST, 'service-config.json');
  if (fs.existsSync(sc) && !errors.length) {
    const c = JSON.parse(fs.readFileSync(sc, 'utf8'));
    c.port === values.PORT_MULTIMEDIA ? ok('service-config.json coincide con ports.env') : warn(`service-config.json (${c.port}) difiere de ports.env (${values.PORT_MULTIMEDIA}): ejecute node scripts/sync-extension-config.mjs`);
  }
} else warn('extension-dist/ no existe: ejecute build.bat');

console.log(problems ? `\nDiagnostico finalizado con ${problems} problema(s).` : '\nDiagnostico finalizado sin problemas.');
process.exit(problems ? 1 : 0);
