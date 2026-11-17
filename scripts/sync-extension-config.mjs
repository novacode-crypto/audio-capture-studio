// Genera extension-dist/service-config.json a partir de config/ports.env (fuente unica).
// La extension descubre su endpoint leyendo ese archivo (validado en runtime).
import fs from 'node:fs';
import path from 'node:path';
import { EXT_DIST, readPorts, readAppEnv, loopbackHost } from './lib/config.mjs';

const { values, errors } = readPorts();
if (errors.length) {
  console.error('ports.env no valido:\n - ' + errors.join('\n - '));
  process.exit(1);
}
const host = loopbackHost(readAppEnv());
fs.mkdirSync(EXT_DIST, { recursive: true });
const out = {
  host: host === 'localhost' ? '127.0.0.1' : host,
  port: values.PORT_MULTIMEDIA,
  healthPort: values.PORT_HEALTH,
  generatedFrom: 'config/ports.env',
};
fs.writeFileSync(path.join(EXT_DIST, 'service-config.json'), JSON.stringify(out, null, 2));
console.log(`service-config.json actualizado (servicio ${out.host}:${out.port}, salud ${out.healthPort})`);
