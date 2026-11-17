// Prepara y verifica FFmpeg/FFprobe usando el mismo resolvedor que el servicio y diagnostico.
import { resolveMediaBinaries } from './lib/media-binaries.mjs';
import { readAppEnv } from './lib/config.mjs';

const media = resolveMediaBinaries(readAppEnv());
for (const [name, bin, version, source] of [
  ['FFmpeg', media.ffmpeg, media.ffmpegVersion, media.ffmpegSource],
  ['FFprobe', media.ffprobe, media.ffprobeVersion, media.ffprobeSource],
]) {
  if (version) {
    console.log(`${name} : ${version}`);
    console.log(`  Ruta: ${bin}`);
    console.log(`  Origen: ${source}`);
  } else {
    console.log(`${name} : NO DISPONIBLE`);
  }
}
if (!media.ffmpegVersion || !media.ffprobeVersion) {
  console.log('La captura basica funciona sin el servicio multimedia; conversion y analisis avanzado requieren ambos ejecutables.');
  console.log('Configure las rutas en config/app.env o instale FFmpeg completo y agregue su carpeta bin al PATH.');
  process.exit(1);
}
console.log('FFmpeg y FFprobe estan listos.');
