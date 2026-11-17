// CLI de puertos. Lo usan TODOS los .bat para leer/validar/modificar config/ports.env.
// Uso: node scripts/ports-cli.mjs <show|validate|get|set|reset|check> [args]
// Codigos de salida: 0 correcto, 1 configuracion invalida, 2 puerto ocupado, 3 uso incorrecto
import fs from 'node:fs';
import {
  PORTS_FILE, PORTS_DEFAULTS_FILE, readPorts, readEnvFile, isPortFree, findPortOwner,
  readPidFile, pidAlive, writeEnvValue, readAppEnv, loopbackHost,
} from './lib/config.mjs';

const [cmd, ...args] = process.argv.slice(2);

function ownPidForPort(port) {
  const info = readPidFile();
  if (!info || !pidAlive(info.pid)) return null;
  const ports = [info.port, info.healthPort];
  return ports.includes(port) ? info.pid : null;
}

async function diagnose(values, { quiet = false } = {}) {
  let conflicts = 0;
  const host = loopbackHost(readAppEnv());
  for (const [key, port] of Object.entries(values)) {
    const free = await isPortFree(port, host === 'localhost' ? '127.0.0.1' : host);
    if (free) {
      if (!quiet) console.log(`  [LIBRE]   ${key}=${port}`);
      continue;
    }
    const mine = ownPidForPort(port);
    if (mine) {
      if (!quiet) console.log(`  [EN USO]  ${key}=${port}  -> servicio de AUDIO CAPTURE STUDIO (PID ${mine})`);
      continue;
    }
    conflicts++;
    const owner = findPortOwner(port);
    const who = owner ? `PID ${owner.pid} (${owner.name})` : 'proceso no identificado';
    console.log(`  [OCUPADO] ${key}=${port}  -> ${who}`);
  }
  return conflicts;
}

function printErrors(errors) {
  console.log('Configuracion de puertos NO valida:');
  for (const e of errors) console.log('  - ' + e);
  console.log(`\nEdite ${PORTS_FILE} o ejecute configurar-puertos.bat`);
}

async function main() {
  const { values, errors } = readPorts();
  switch (cmd) {
    case 'show': {
      console.log(`Archivo: ${PORTS_FILE}`);
      for (const [k, v] of Object.entries(values)) console.log(`  ${k}=${v}`);
      if (errors.length) {
        printErrors(errors);
        process.exit(1);
      }
      break;
    }
    case 'get': {
      if (errors.length) {
        printErrors(errors);
        process.exit(1);
      }
      if (!(args[0] in values)) {
        console.error('Variable desconocida: ' + args[0]);
        process.exit(3);
      }
      process.stdout.write(String(values[args[0]]));
      break;
    }
    case 'validate':
    case 'check': {
      if (errors.length) {
        printErrors(errors);
        process.exit(1);
      }
      console.log(`Puertos configurados (${PORTS_FILE}):`);
      const conflicts = await diagnose(values);
      if (conflicts) {
        console.log(`\nSe detectaron ${conflicts} conflicto(s). No se terminan procesos ajenos ni se cambia el puerto en silencio.`);
        console.log('Libere el puerto o cambie el valor en config/ports.env (o con configurar-puertos.bat).');
        process.exit(2);
      }
      console.log('\nTodos los puertos son validos y estan disponibles.');
      break;
    }
    case 'set': {
      const [key, val, flag] = args;
      const defaults = readEnvFile(PORTS_DEFAULTS_FILE) ?? {};
      if (!key || !val || !(key in defaults)) {
        console.error(`Uso: set <${Object.keys(defaults).join('|')}> <puerto> [--force]`);
        process.exit(3);
      }
      if (!/^\d+$/.test(val) || Number(val) < 1024 || Number(val) > 65535) {
        console.error('Puerto invalido: debe ser un entero entre 1024 y 65535.');
        process.exit(1);
      }
      const n = Number(val);
      for (const [k, v] of Object.entries(values)) {
        if (k !== key && v === n) {
          console.error(`Puerto duplicado: ${k} ya usa ${n}.`);
          process.exit(1);
        }
      }
      if (!ownPidForPort(n) && !(await isPortFree(n))) {
        const owner = findPortOwner(n);
        console.error(`El puerto ${n} esta OCUPADO por ${owner ? `PID ${owner.pid} (${owner.name})` : 'un proceso no identificado'}.`);
        if (flag !== '--force') process.exit(2);
        console.error('Se guarda igualmente (--force).');
      }
      writeEnvValue(PORTS_FILE, key, String(n));
      console.log(`Guardado ${key}=${n} en ${PORTS_FILE}`);
      break;
    }
    case 'reset': {
      const defaults = readEnvFile(PORTS_DEFAULTS_FILE);
      if (!defaults) {
        console.error('Falta config/ports.defaults.env');
        process.exit(1);
      }
      if (!fs.existsSync(PORTS_FILE)) fs.copyFileSync(PORTS_DEFAULTS_FILE, PORTS_FILE);
      for (const [k, v] of Object.entries(defaults)) writeEnvValue(PORTS_FILE, k, v);
      console.log('Valores predeterminados restaurados en config/ports.env');
      break;
    }
    default:
      console.error('Comandos: show | get <VAR> | validate | set <VAR> <puerto> [--force] | reset');
      process.exit(3);
  }
}

main().catch((e) => {
  console.error('Error: ' + (e?.message || e));
  process.exit(1);
});
