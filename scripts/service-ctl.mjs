// Control del servicio multimedia: start | stop | status | token
// Solo gestiona procesos propios (identificados por runtime/service.pid.json).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  ROOT, RUNTIME_DIR, DATA_DIR, PID_FILE, readPorts, readAppEnv, loopbackHost, isPortFree, findPortOwner,
  readPidFile, pidAlive, httpGetJson,
} from './lib/config.mjs';

const cmd = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokenFile = path.join(DATA_DIR, 'service-token.txt');
const readToken = () => (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : null);

function fatalPorts(errors) {
  console.log('Configuracion de puertos NO valida:');
  for (const e of errors) console.log('  - ' + e);
  console.log('Edite config/ports.env o ejecute configurar-puertos.bat');
  process.exit(1);
}

async function running() {
  const info = readPidFile();
  if (!info) return null;
  if (!pidAlive(info.pid)) {
    fs.rmSync(PID_FILE, { force: true });
    return null;
  }
  // Verificacion de identidad: el PID debe escuchar en el puerto registrado
  const owner = findPortOwner(info.port);
  if (owner && owner.pid !== info.pid) return null;
  return info;
}

async function start() {
  const { values, errors } = readPorts();
  if (errors.length) fatalPorts(errors);
  const host = loopbackHost(readAppEnv());
  const current = await running();
  if (current) {
    console.log(`El servicio ya esta en ejecucion (PID ${current.pid}) en el puerto ${current.port}.`);
    if (current.port !== values.PORT_MULTIMEDIA || current.healthPort !== values.PORT_HEALTH) {
      console.log('AVISO: config/ports.env cambio despues del arranque. Reinicie: stop.bat y luego start.bat');
      console.log(`       En ejecucion: ${current.port}/${current.healthPort}  |  Configurado: ${values.PORT_MULTIMEDIA}/${values.PORT_HEALTH}`);
    }
    return;
  }
  const bindHost = host === 'localhost' ? '127.0.0.1' : host;
  let conflicts = 0;
  for (const [k, p] of Object.entries(values)) {
    if (await isPortFree(p, bindHost)) continue;
    conflicts++;
    const o = findPortOwner(p);
    console.log(`[OCUPADO] ${k}=${p} -> ${o ? `PID ${o.pid} (${o.name})` : 'proceso no identificado'}`);
  }
  if (conflicts) {
    console.log('\nInicio CANCELADO. No se han terminado procesos ajenos ni se ha cambiado ningun puerto.');
    console.log('Opciones: liberar el puerto, o modificar config/ports.env (configurar-puertos.bat).');
    process.exit(2);
  }
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const logPath = path.join(RUNTIME_DIR, 'service.log');
  const out = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'multimedia-service', 'server.mjs')], {
    cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: true,
  });
  child.unref();
  const url = `http://${bindHost}:${values.PORT_HEALTH}/health`;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const r = await httpGetJson(url, 1000);
    if (r.status === 200 && r.body?.ok) {
      console.log('Servicio multimedia iniciado correctamente.');
      console.log(`  PID .............. ${r.body.pid}`);
      console.log(`  API .............. http://${bindHost}:${values.PORT_MULTIMEDIA}`);
      console.log(`  Diagnostico ...... ${url}`);
      console.log(`  FFmpeg/FFprobe ... ${r.body.ffmpeg ? 'OK' : 'NO DISPONIBLE'} / ${r.body.ffprobe ? 'OK' : 'NO DISPONIBLE'}`);
      console.log(`  Registro ......... ${logPath}`);
      const t = readToken();
      if (t) console.log(`\n  TOKEN de vinculacion (pegar en Ajustes > Servicio multimedia):\n  ${t}`);
      return;
    }
    if (!pidAlive(child.pid)) break;
  }
  console.log('El servicio no respondio. Ultimas lineas del registro:');
  try {
    console.log(fs.readFileSync(logPath, 'utf8').split('\n').slice(-12).join('\n'));
  } catch { /* sin registro */ }
  process.exit(1);
}

async function stop() {
  const info = readPidFile();
  if (!info) {
    console.log('No hay servicio propio registrado en ejecucion.');
    return;
  }
  if (!pidAlive(info.pid)) {
    fs.rmSync(PID_FILE, { force: true });
    console.log('El servicio registrado ya no estaba en ejecucion. Registro limpiado.');
    return;
  }
  const owner = findPortOwner(info.port);
  if (owner && owner.pid !== info.pid) {
    console.log(`El puerto ${info.port} lo ocupa otro proceso (PID ${owner.pid}, ${owner.name}), no el servicio propio. No se toca.`);
    fs.rmSync(PID_FILE, { force: true });
    return;
  }
  const token = readToken();
  const bindHost = info.host === 'localhost' ? '127.0.0.1' : info.host;
  try {
    if (token) {
      await fetch(`http://${bindHost}:${info.port}/v1/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000) });
    }
  } catch { /* se intentara terminar el PID propio */ }
  for (let i = 0; i < 20 && pidAlive(info.pid); i++) await sleep(250);
  if (pidAlive(info.pid)) {
    try { process.kill(info.pid); } catch { /* ya terminado */ }
    for (let i = 0; i < 12 && pidAlive(info.pid); i++) await sleep(250);
  }
  fs.rmSync(PID_FILE, { force: true });
  console.log(pidAlive(info.pid) ? `No se pudo detener el PID ${info.pid}.` : `Servicio propio detenido (PID ${info.pid}). Puertos ${info.port}/${info.healthPort} liberados.`);
  if (pidAlive(info.pid)) process.exit(1);
}

async function status() {
  const { values, errors } = readPorts();
  if (errors.length) fatalPorts(errors);
  const bindHost = loopbackHost(readAppEnv()).replace('localhost', '127.0.0.1');
  const info = await running();
  if (!info) {
    console.log('Servicio: DETENIDO');
    return;
  }
  const r = await httpGetJson(`http://${bindHost}:${info.healthPort}/health`, 1500);
  console.log(`Servicio: EN EJECUCION (PID ${info.pid}) - salud: ${r.status === 200 ? 'OK' : 'SIN RESPUESTA'}`);
  console.log(`  Puertos en ejecucion: ${info.port}/${info.healthPort}`);
  if (info.port !== values.PORT_MULTIMEDIA || info.healthPort !== values.PORT_HEALTH) {
    console.log(`  AVISO: ports.env indica ${values.PORT_MULTIMEDIA}/${values.PORT_HEALTH}. Es necesario REINICIAR el servicio.`);
  }
}

switch (cmd) {
  case 'start': await start(); break;
  case 'stop': await stop(); break;
  case 'status': await status(); break;
  case 'token': {
    const t = readToken();
    if (!t) { console.log('Aun no existe token. Inicie el servicio (start.bat).'); process.exit(1); }
    console.log(t);
    break;
  }
  default:
    console.error('Uso: node scripts/service-ctl.mjs <start|stop|status|token>');
    process.exit(3);
}
